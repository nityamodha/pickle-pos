"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import Header from "@/components/Header";
import ToastViewport, { type ToastMessage } from "@/components/ToastViewport";
import {
  describePaymentSplit,
  formatCurrency,
  formatDateTime,
  getDateKey,
  getReconciliationLabel,
  getReconciliationStatus,
  getReconciliationStyles,
  roundCurrency,
  summarisePaymentMethod,
  summarisePaymentReceiver,
  type ReconciliationStatus,
} from "@/lib/finance";
import { formatOrderItemPrice, getOrderItemLabel } from "@/lib/order-items";
import {
  getPaymentMethodLabel,
  getPaymentReceiverLabel,
  PAYMENT_ACTORS,
  PAYMENT_ENTRY_METHODS,
  type PaymentActor,
  type PaymentEntryMethod,
  type PaymentMethod,
  type PaymentReceiver,
} from "@/lib/payment";
import { getStatusIcon, getStatusLabel, getStatusStyles, type OrderStatus } from "@/lib/order-status";
import { supabase } from "@/lib/supabase";

type OrderItem = {
  id: number;
  product_name: string;
  size: string;
  unit_price: number | null;
  qty: number;
};

type BaseOrder = {
  id: number;
  created_at: string;
  name: string;
  phone: string;
  type: "PICKUP" | "DELIVERY";
  address: string | null;
  total: number | string | null;
  status: OrderStatus;
  payment_received: number | string | null;
  payment_method: PaymentMethod | null;
  received_by: PaymentReceiver | null;
  paid_at: string | null;
  order_items: OrderItem[];
};

type PaymentEntry = {
  id: number;
  order_id: number;
  amount: number | string;
  method: PaymentEntryMethod;
  received_by: PaymentActor;
  notes: string | null;
  updated_by: PaymentActor;
  created_at: string;
  updated_at: string;
};

type AuditLogEntry = {
  id: number;
  order_id: number;
  action_type: string;
  actor: PaymentActor;
  summary: string;
  created_at: string;
};

type FinanceOrder = BaseOrder & {
  payment_entries: PaymentEntry[];
  audit_log: AuditLogEntry[];
  totalAmount: number;
  totalReceived: number;
  balance: number;
  reconciliationStatus: ReconciliationStatus;
  paymentMethodSummary: PaymentMethod | null;
  paymentReceiverSummary: PaymentReceiver | null;
};

type PaymentLineDraft = {
  localId: string;
  id?: number;
  amount: string;
  method: PaymentEntryMethod;
  receiver: PaymentActor;
  notes: string;
};

type OrderPaymentDraft = {
  actor: PaymentActor;
  lines: PaymentLineDraft[];
};

type FinanceMetrics = {
  activeOrders: FinanceOrder[];
  allOrders: FinanceOrder[];
  readyOrders: FinanceOrder[];
  completedOrders: FinanceOrder[];
  lifetimeSales: number;
  lifetimeCollected: number;
  lifetimeOutstanding: number;
  todaySales: number;
  todayCollected: number;
  todayOutstanding: number;
  todayOrders: number;
  settledCount: number;
  underpaidCount: number;
  overpaidCount: number;
  unpaidCount: number;
  cashCollectedToday: number;
  onlineCollectedToday: number;
};

const SUMMARY_EMAIL_TO = process.env.NEXT_PUBLIC_FINANCE_SUMMARY_EMAIL_TO ?? "";

function createEmptyLine(defaultAmount: number): PaymentLineDraft {
  return {
    localId: crypto.randomUUID(),
    amount: defaultAmount > 0 ? String(defaultAmount) : "",
    method: "CASH",
    receiver: "NEETA",
    notes: "",
  };
}

function buildDraft(order: FinanceOrder): OrderPaymentDraft {
  const remaining = Math.max(0, roundCurrency(order.totalAmount - order.totalReceived));

  if (order.payment_entries.length === 0) {
    return {
      actor: "NEETA",
      lines: [createEmptyLine(remaining || order.totalAmount)],
    };
  }

  const latestActor = order.audit_log[0]?.actor ?? order.payment_entries[0]?.updated_by ?? "NEETA";

  return {
    actor: latestActor,
    lines: order.payment_entries.map((entry) => ({
      localId: `existing-${entry.id}`,
      id: entry.id,
      amount: String(Number(entry.amount)),
      method: entry.method,
      receiver: entry.received_by,
      notes: entry.notes ?? "",
    })),
  };
}

function buildFinanceOrder(
  order: BaseOrder,
  paymentEntries: PaymentEntry[],
  auditLog: AuditLogEntry[]
): FinanceOrder {
  const totalAmount = Number(order.total ?? 0);
  const totalReceived = roundCurrency(
    paymentEntries.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0)
  );
  const balance = roundCurrency(totalAmount - totalReceived);

  return {
    ...order,
    payment_entries: paymentEntries,
    audit_log: auditLog,
    totalAmount,
    totalReceived,
    balance,
    reconciliationStatus: getReconciliationStatus(totalAmount, totalReceived),
    paymentMethodSummary:
      summarisePaymentMethod(paymentEntries.map((entry) => entry.method)) ??
      order.payment_method,
    paymentReceiverSummary:
      summarisePaymentReceiver(paymentEntries.map((entry) => entry.received_by)) ??
      order.received_by,
  };
}

function buildMetrics(orders: FinanceOrder[]): FinanceMetrics {
  const todayKey = getDateKey(new Date());
  const activeOrders = orders.filter(
    (order) => order.status === "READY" || order.status === "COMPLETED"
  );
  const readyOrders = activeOrders.filter((order) => order.status === "READY");
  const completedOrders = activeOrders.filter((order) => order.status === "COMPLETED");
  const todayOrders = orders.filter(
    (order) => order.status !== "CANCELLED" && getDateKey(order.created_at) === todayKey
  );

  const paymentsToday = orders.flatMap((order) =>
    order.payment_entries.filter((entry) => getDateKey(entry.created_at) === todayKey)
  );

  return {
    activeOrders,
    allOrders: orders,
    readyOrders,
    completedOrders,
    lifetimeSales: roundCurrency(
      orders
        .filter((order) => order.status !== "CANCELLED")
        .reduce((sum, order) => sum + order.totalAmount, 0)
    ),
    lifetimeCollected: roundCurrency(
      orders.reduce((sum, order) => sum + order.totalReceived, 0)
    ),
    lifetimeOutstanding: roundCurrency(
      orders.reduce((sum, order) => sum + Math.max(order.balance, 0), 0)
    ),
    todaySales: roundCurrency(todayOrders.reduce((sum, order) => sum + order.totalAmount, 0)),
    todayCollected: roundCurrency(
      paymentsToday.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0)
    ),
    todayOutstanding: roundCurrency(
      todayOrders.reduce((sum, order) => sum + Math.max(order.balance, 0), 0)
    ),
    todayOrders: todayOrders.length,
    settledCount: completedOrders.filter((order) => order.reconciliationStatus === "SETTLED").length,
    underpaidCount: completedOrders.filter((order) => order.reconciliationStatus === "UNDERPAID").length,
    overpaidCount: completedOrders.filter((order) => order.reconciliationStatus === "OVERPAID").length,
    unpaidCount: completedOrders.filter((order) => order.reconciliationStatus === "UNPAID").length,
    cashCollectedToday: roundCurrency(
      paymentsToday
        .filter((entry) => entry.method === "CASH")
        .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0)
    ),
    onlineCollectedToday: roundCurrency(
      paymentsToday
        .filter((entry) => entry.method === "ONLINE")
        .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0)
    ),
  };
}

function buildSummaryEmail(metrics: FinanceMetrics): string {
  const todayKey = getDateKey(new Date());

  return [
    `Awesome Achaar Finance Summary - ${todayKey}`,
    "",
    "Today's Metrics",
    `Orders created: ${metrics.todayOrders}`,
    `Sales billed: ${formatCurrency(metrics.todaySales)}`,
    `Payments received today: ${formatCurrency(metrics.todayCollected)}`,
    `Cash received today: ${formatCurrency(metrics.cashCollectedToday)}`,
    `Online received today: ${formatCurrency(metrics.onlineCollectedToday)}`,
    `Outstanding on today's orders: ${formatCurrency(metrics.todayOutstanding)}`,
    "",
    "Lifetime Metrics",
    `Lifetime sales billed: ${formatCurrency(metrics.lifetimeSales)}`,
    `Lifetime payments received: ${formatCurrency(metrics.lifetimeCollected)}`,
    `Outstanding dues: ${formatCurrency(metrics.lifetimeOutstanding)}`,
    "",
    "Reconciliation Snapshot",
    `Settled orders: ${metrics.settledCount}`,
    `Underpaid orders: ${metrics.underpaidCount}`,
    `Overpaid orders: ${metrics.overpaidCount}`,
    `Unpaid completed orders: ${metrics.unpaidCount}`,
  ].join("\n");
}

export default function FinancePage() {
  const [orders, setOrders] = useState<FinanceOrder[]>([]);
  const [paymentDrafts, setPaymentDrafts] = useState<Record<number, OrderPaymentDraft>>({});
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [isSavingOrderId, setIsSavingOrderId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);

  const pushToast = (
    title: string,
    description?: string,
    tone: ToastMessage["tone"] = "info"
  ) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, title, description, tone }]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const loadAndSetFinanceData = async () => {
    const [ordersResponse, paymentResponse, auditResponse] =
      await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, created_at, name, phone, type, address, total, status, payment_received, payment_method, received_by, paid_at, order_items(id, product_name, size, unit_price, qty)"
          )
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("order_payment_entries")
          .select(
            "id, order_id, amount, method, received_by, notes, updated_by, created_at, updated_at"
          )
          .order("created_at", { ascending: true }),
        supabase
          .from("payment_audit_log")
          .select("id, order_id, action_type, actor, summary, created_at")
          .order("created_at", { ascending: false })
          .limit(600),
      ]);

    if (ordersResponse.error || paymentResponse.error || auditResponse.error) {
      console.error("Finance load error:", {
        orders: ordersResponse.error,
        payments: paymentResponse.error,
        audit: auditResponse.error,
      });
      pushToast(
        "Finance data unavailable",
        "Run the latest SQL migration in Supabase so split payments and audit history tables exist.",
        "error"
      );
      return;
    }

    const paymentByOrder = new Map<number, PaymentEntry[]>();
    for (const entry of (paymentResponse.data ?? []) as PaymentEntry[]) {
      const orderEntries = paymentByOrder.get(entry.order_id) ?? [];
      orderEntries.push(entry);
      paymentByOrder.set(entry.order_id, orderEntries);
    }

    const auditByOrder = new Map<number, AuditLogEntry[]>();
    for (const entry of (auditResponse.data ?? []) as AuditLogEntry[]) {
      const orderAudit = auditByOrder.get(entry.order_id) ?? [];
      orderAudit.push(entry);
      auditByOrder.set(entry.order_id, orderAudit);
    }

    const enrichedOrders = ((ordersResponse.data ?? []) as BaseOrder[]).map((order) =>
      buildFinanceOrder(
        order,
        paymentByOrder.get(order.id) ?? [],
        auditByOrder.get(order.id) ?? []
      )
    );

    setOrders(enrichedOrders);
    setPaymentDrafts((prev) => {
      const nextDrafts = { ...prev };

      for (const order of enrichedOrders) {
        nextDrafts[order.id] = prev[order.id] ?? buildDraft(order);
      }

      return nextDrafts;
    });
  };

  const refreshFinanceData = useEffectEvent(async () => {
    await loadAndSetFinanceData();
  });

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void refreshFinanceData();
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const channels = [
      supabase
        .channel("finance-orders-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders" },
          () => void refreshFinanceData()
        )
        .subscribe(),
      supabase
        .channel("finance-payment-entries-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "order_payment_entries" },
          () => void refreshFinanceData()
        )
        .subscribe(),
      supabase
        .channel("finance-audit-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "payment_audit_log" },
          () => void refreshFinanceData()
        )
        .subscribe(),
    ];

    return () => {
      for (const channel of channels) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const updateDraftActor = (orderId: number, actor: PaymentActor) => {
    setPaymentDrafts((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] ?? { actor, lines: [createEmptyLine(0)] }),
        actor,
      },
    }));
  };

  const updateDraftLine = <Key extends keyof PaymentLineDraft>(
    orderId: number,
    localId: string,
    key: Key,
    value: PaymentLineDraft[Key]
  ) => {
    setPaymentDrafts((prev) => {
      const draft = prev[orderId];

      if (!draft) {
        return prev;
      }

      return {
        ...prev,
        [orderId]: {
          ...draft,
          lines: draft.lines.map((line) =>
            line.localId === localId ? { ...line, [key]: value } : line
          ),
        },
      };
    });
  };

  const addDraftLine = (order: FinanceOrder) => {
    setPaymentDrafts((prev) => {
      const draft = prev[order.id] ?? buildDraft(order);
      const remaining = Math.max(0, roundCurrency(order.totalAmount - order.totalReceived));

      return {
        ...prev,
        [order.id]: {
          ...draft,
          lines: [...draft.lines, createEmptyLine(remaining)],
        },
      };
    });
  };

  const removeDraftLine = (orderId: number, localId: string) => {
    setPaymentDrafts((prev) => {
      const draft = prev[orderId];

      if (!draft) {
        return prev;
      }

      const nextLines = draft.lines.filter((line) => line.localId !== localId);

      return {
        ...prev,
        [orderId]: {
          ...draft,
          lines:
            nextLines.length > 0
              ? nextLines
              : [
                  {
                    ...createEmptyLine(0),
                    receiver: draft.actor,
                  },
                ],
        },
      };
    });
  };

  const savePayments = async (order: FinanceOrder) => {
    const draft = paymentDrafts[order.id] ?? buildDraft(order);
    const validLines = draft.lines
      .map((line) => ({
        ...line,
        amountNumber: Number(line.amount),
      }))
      .filter((line) => line.amount.trim().length > 0 || line.notes.trim().length > 0);

    if (validLines.length === 0) {
      pushToast(
        "Add at least one payment line",
        `Order #${order.id} needs at least one payment entry to save dues and split payments.`,
        "error"
      );
      return;
    }

    const invalidLine = validLines.find(
      (line) => !Number.isFinite(line.amountNumber) || line.amountNumber <= 0
    );

    if (invalidLine) {
      pushToast(
        "Check payment amounts",
        `All payment lines for Order #${order.id} need a valid amount greater than zero.`,
        "error"
      );
      return;
    }

    setIsSavingOrderId(order.id);

    const linesToPersist = validLines.map((line) => ({
      ...(line.id ? { id: line.id } : {}),
      order_id: order.id,
      amount: line.amountNumber,
      method: line.method,
      received_by: line.receiver,
      notes: line.notes.trim() || null,
      updated_by: draft.actor,
      updated_at: new Date().toISOString(),
    }));

    const currentEntryIds = order.payment_entries.map((entry) => entry.id);
    const draftEntryIds = validLines
      .filter((line) => typeof line.id === "number")
      .map((line) => line.id as number);
    const entryIdsToDelete = currentEntryIds.filter((id) => !draftEntryIds.includes(id));

    if (entryIdsToDelete.length > 0) {
      const { error } = await supabase
        .from("order_payment_entries")
        .delete()
        .in("id", entryIdsToDelete);

      if (error) {
        console.error("Delete payment entries error:", error);
        pushToast(
          "Couldn’t remove old payment lines",
          `Order #${order.id} still has unsaved payment changes.`,
          "error"
        );
        setIsSavingOrderId(null);
        return;
      }
    }

    const { error: upsertError } = await supabase
      .from("order_payment_entries")
      .upsert(linesToPersist);

    if (upsertError) {
      console.error("Save payment entries error:", upsertError);
      pushToast(
        "Payment save failed",
        `Order #${order.id} could not be updated. Confirm the finance ledger tables exist in Supabase.`,
        "error"
      );
      setIsSavingOrderId(null);
      return;
    }

    const totalReceived = roundCurrency(
      linesToPersist.reduce((sum, line) => sum + Number(line.amount ?? 0), 0)
    );
    const paymentMethodSummary = summarisePaymentMethod(
      linesToPersist.map((line) => line.method)
    );
    const paymentReceiverSummary = summarisePaymentReceiver(
      linesToPersist.map((line) => line.received_by)
    );
    const balance = roundCurrency(order.totalAmount - totalReceived);

    const { error: orderError } = await supabase
      .from("orders")
      .update({
        status: "COMPLETED",
        payment_received: totalReceived,
        payment_method: paymentMethodSummary,
        received_by: paymentReceiverSummary,
        paid_at: order.paid_at ?? new Date().toISOString(),
      })
      .eq("id", order.id);

    if (orderError) {
      console.error("Update order finance summary error:", orderError);
      pushToast(
        "Order summary failed",
        `Order #${order.id} payment lines saved, but the order summary could not be updated.`,
        "error"
      );
      setIsSavingOrderId(null);
      return;
    }

    const summary =
      balance > 0.01
        ? `Saved ${validLines.length} payment line(s), received ${formatCurrency(totalReceived)}, due ${formatCurrency(balance)}.`
        : balance < -0.01
          ? `Saved ${validLines.length} payment line(s), received ${formatCurrency(totalReceived)}, over by ${formatCurrency(Math.abs(balance))}.`
          : `Saved ${validLines.length} payment line(s), settled at ${formatCurrency(totalReceived)}.`;

    const { error: auditError } = await supabase.from("payment_audit_log").insert({
      order_id: order.id,
      action_type: order.status === "READY" ? "ORDER_COMPLETED" : "PAYMENT_UPDATED",
      actor: draft.actor,
      summary,
      payload: {
        line_count: validLines.length,
        total_received: totalReceived,
        balance,
      },
    });

    if (auditError) {
      console.error("Payment audit log error:", auditError);
    }

    pushToast(
      order.status === "READY" ? "Order completed" : "Payment updated",
      `Order #${order.id} is now ${getReconciliationLabel(getReconciliationStatus(order.totalAmount, totalReceived)).toLowerCase()}.`,
      "success"
    );

    setExpandedOrderId(null);
    setIsSavingOrderId(null);
    await loadAndSetFinanceData();
  };

  const copyEmailSummary = async (body: string) => {
    try {
      await navigator.clipboard.writeText(body);
      pushToast("Summary copied", "The finance email summary is ready to paste.", "success");
    } catch (error) {
      console.error("Clipboard error:", error);
      pushToast("Copy failed", "Your browser blocked clipboard access.", "error");
    }
  };

  const openMailDraft = (subject: string, body: string) => {
    const mailtoUrl = `mailto:${encodeURIComponent(SUMMARY_EMAIL_TO)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, "_self");
  };

  const metrics = buildMetrics(orders);
  const emailBody = buildSummaryEmail(metrics);
  const emailSubject = `Awesome Achaar Finance Summary - ${getDateKey(new Date())}`;

  return (
    <div className="glass-page min-h-dvh overflow-x-hidden">
      <ToastViewport
        toasts={toasts}
        onDismiss={(id) =>
          setToasts((prev) => prev.filter((toast) => toast.id !== id))
        }
      />

      <Header
        title="Finance Dashboard"
        subtitle="Track split payments, dues, reconciliation, and payment handoffs."
      />

      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-5">
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="glass-panel rounded-[28px] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">
              Ready To Close
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{metrics.readyOrders.length}</p>
            <p className="mt-1 text-sm text-slate-500">Orders waiting for finance confirmation.</p>
          </div>

          <div className="glass-panel rounded-[28px] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
              Lifetime Collected
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {formatCurrency(metrics.lifetimeCollected)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Outstanding dues {formatCurrency(metrics.lifetimeOutstanding)}.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">
              Payment Queue
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              Ready and completed orders
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Record split payments, keep notes, and see each order’s due balance at a glance.
            </p>
          </div>

          {metrics.activeOrders.length === 0 ? (
            <div className="glass-panel-soft rounded-[28px] border border-dashed border-white/70 px-6 py-10 text-center">
              <p className="text-lg font-semibold text-slate-900">No finance orders yet</p>
              <p className="mt-2 text-sm text-slate-500">
                Orders moved to READY or COMPLETED will appear here.
              </p>
            </div>
          ) : (
            metrics.activeOrders.map((order) => {
              const isExpanded = expandedOrderId === order.id;
              const draft = paymentDrafts[order.id] ?? buildDraft(order);
              const statusClassName = getStatusStyles(order.status);
              const statusIcon = getStatusIcon(order.status);
              const statusLabel = getStatusLabel(order.status);

              return (
                <div key={order.id} className="glass-panel rounded-[28px] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        #{order.id} • {order.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">{order.phone}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        {order.type === "DELIVERY" ? "Delivery" : "Pickup"}
                        {order.address ? ` • ${order.address}` : ""}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span
                        aria-label={`Order status: ${statusLabel}`}
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${statusClassName}`}
                      >
                        <span aria-hidden="true" className="text-[10px] leading-none">
                          {statusIcon}
                        </span>
                        <span>{order.status}</span>
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${getReconciliationStyles(order.reconciliationStatus)}`}
                      >
                        {getReconciliationLabel(order.reconciliationStatus)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="glass-panel-soft rounded-2xl p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Order Total
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {formatCurrency(order.totalAmount)}
                      </p>
                    </div>
                    <div className="glass-panel-soft rounded-2xl p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Received
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {formatCurrency(order.totalReceived)}
                      </p>
                    </div>
                    <div className="glass-panel-soft rounded-2xl p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Balance
                      </p>
                      <p
                        className={`mt-2 text-lg font-semibold ${
                          order.balance > 0.01
                            ? "text-amber-700"
                            : order.balance < -0.01
                              ? "text-rose-700"
                              : "text-emerald-700"
                        }`}
                      >
                        {order.balance > 0.01
                          ? `${formatCurrency(order.balance)} due`
                          : order.balance < -0.01
                            ? `${formatCurrency(Math.abs(order.balance))} extra`
                            : "Settled"}
                      </p>
                    </div>
                  </div>

                  <div className="glass-panel-soft mt-4 rounded-2xl p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Items
                      </p>
                      <p className="text-xs text-slate-500">
                        Created {formatDateTime(order.created_at)}
                      </p>
                    </div>
                    <div className="space-y-1 break-words text-sm text-slate-700">
                      {order.order_items?.map((item) => (
                        <p key={item.id}>
                          {item.qty}× {getOrderItemLabel(item)}
                          {formatOrderItemPrice(item.unit_price, item.qty) && (
                            <span className="ml-2 text-xs text-slate-400">
                              {formatOrderItemPrice(item.unit_price, item.qty)}
                            </span>
                          )}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {order.payment_entries.length > 0 ? (
                      <>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {describePaymentSplit(
                            order.payment_entries.map((entry) => entry.method),
                            order.payment_entries.map((entry) => entry.received_by)
                          )}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {order.payment_entries.length} payment line{order.payment_entries.length === 1 ? "" : "s"}
                        </span>
                      </>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        No payments recorded yet
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">
                      {order.audit_log[0]
                        ? `Last edit ${formatDateTime(order.audit_log[0].created_at)} by ${getPaymentReceiverLabel(order.audit_log[0].actor)}`
                        : "No audit entries yet"}
                    </p>
                    <button
                      onClick={() =>
                        setExpandedOrderId((current) =>
                          current === order.id ? null : order.id
                        )
                      }
                      className="glass-button-primary rounded-full px-3 py-2 text-xs font-medium text-white transition hover:brightness-110"
                    >
                      {isExpanded ? "Hide details" : "Manage payment"}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="glass-panel-soft mt-4 space-y-4 rounded-3xl p-4">
                      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Updated By
                          <select
                            value={draft.actor}
                            onChange={(event) =>
                              updateDraftActor(order.id, event.target.value as PaymentActor)
                            }
                            className="glass-chip rounded-2xl px-3 py-3 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none transition focus:border-cyan-300"
                          >
                            {PAYMENT_ACTORS.map((actor) => (
                              <option key={actor} value={actor}>
                                {getPaymentReceiverLabel(actor)}
                              </option>
                            ))}
                          </select>
                        </label>

                        <button
                          onClick={() => addDraftLine(order)}
                          className="glass-button-secondary mt-auto rounded-full px-4 py-3 text-sm font-semibold text-slate-700 transition hover:text-slate-900"
                        >
                          Add split payment
                        </button>
                      </div>

                      <div className="space-y-3">
                        {draft.lines.map((line, index) => (
                          <div
                            key={line.localId}
                            className="glass-panel-soft rounded-3xl p-4"
                          >
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-900">
                                Payment line {index + 1}
                              </p>
                              <button
                                onClick={() => removeDraftLine(order.id, line.localId)}
                                className="text-xs font-semibold text-rose-600 transition hover:text-rose-700"
                              >
                                Remove
                              </button>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-3">
                              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                                Amount
                                <input
                                  value={line.amount}
                                  onChange={(event) =>
                                    updateDraftLine(
                                      order.id,
                                      line.localId,
                                      "amount",
                                      event.target.value
                                    )
                                  }
                                  inputMode="decimal"
                                  className="glass-chip rounded-2xl px-3 py-3 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none transition focus:border-cyan-300"
                                />
                              </label>

                              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                                Method
                                <select
                                  value={line.method}
                                  onChange={(event) =>
                                    updateDraftLine(
                                      order.id,
                                      line.localId,
                                      "method",
                                      event.target.value as PaymentEntryMethod
                                    )
                                  }
                                  className="glass-chip rounded-2xl px-3 py-3 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none transition focus:border-cyan-300"
                                >
                                  {PAYMENT_ENTRY_METHODS.map((method) => (
                                    <option key={method} value={method}>
                                      {getPaymentMethodLabel(method)}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                                Received By
                                <select
                                  value={line.receiver}
                                  onChange={(event) =>
                                    updateDraftLine(
                                      order.id,
                                      line.localId,
                                      "receiver",
                                      event.target.value as PaymentActor
                                    )
                                  }
                                  className="glass-chip rounded-2xl px-3 py-3 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none transition focus:border-cyan-300"
                                >
                                  {PAYMENT_ACTORS.map((receiver) => (
                                    <option key={receiver} value={receiver}>
                                      {getPaymentReceiverLabel(receiver)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>

                            <label className="mt-3 flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                              Notes
                              <input
                                value={line.notes}
                                onChange={(event) =>
                                  updateDraftLine(
                                    order.id,
                                    line.localId,
                                    "notes",
                                    event.target.value
                                  )
                                }
                                placeholder="Example: Rs200 online from son, Rs150 cash at pickup"
                                className="glass-chip rounded-2xl px-3 py-3 text-sm normal-case tracking-normal text-slate-900 outline-none transition focus:border-cyan-300"
                              />
                            </label>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() => void savePayments(order)}
                        disabled={isSavingOrderId === order.id}
                        className="glass-button-primary w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSavingOrderId === order.id
                          ? "Saving..."
                          : order.status === "READY"
                            ? "Save and mark completed"
                            : "Update payment details"}
                      </button>

                      <div className="glass-panel-soft rounded-3xl p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Edit History
                        </p>
                        <div className="mt-3 space-y-2">
                          {order.audit_log.length === 0 ? (
                            <p className="text-sm text-slate-500">
                              No edits recorded yet.
                            </p>
                          ) : (
                            order.audit_log.slice(0, 5).map((entry) => (
                              <div key={entry.id} className="glass-chip rounded-2xl p-3">
                                <p className="text-sm font-medium text-slate-900">
                                  {entry.summary}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {formatDateTime(entry.created_at)} • {getPaymentReceiverLabel(entry.actor)}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>

        <section className="space-y-4 pb-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                Reconciliation
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                Compare billed vs received
              </h2>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                Completed
              </p>
              <p className="text-lg font-semibold text-slate-900">
                {metrics.completedOrders.length}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Today
              </p>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <p>Orders: {metrics.todayOrders}</p>
                <p>Billed: {formatCurrency(metrics.todaySales)}</p>
                <p>Collected: {formatCurrency(metrics.todayCollected)}</p>
                <p>Dues: {formatCurrency(metrics.todayOutstanding)}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Lifetime
              </p>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <p>Billed: {formatCurrency(metrics.lifetimeSales)}</p>
                <p>Collected: {formatCurrency(metrics.lifetimeCollected)}</p>
                <p>Dues: {formatCurrency(metrics.lifetimeOutstanding)}</p>
                <p>Settled: {metrics.settledCount}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {metrics.completedOrders.length === 0 ? (
              <div className="glass-panel-soft rounded-[28px] border border-dashed border-white/70 px-6 py-10 text-center">
                <p className="text-lg font-semibold text-slate-900">No completed orders yet</p>
                <p className="mt-2 text-sm text-slate-500">
                  Completed orders will show settlement gaps here.
                </p>
              </div>
            ) : (
              metrics.completedOrders.map((order) => (
                <div key={`reconciliation-${order.id}`} className="glass-panel rounded-[28px] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        #{order.id} • {order.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {order.payment_entries.length > 0
                          ? `${order.payment_entries.length} payment line${order.payment_entries.length === 1 ? "" : "s"}`
                          : "No payment lines"}
                      </p>
                    </div>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${getReconciliationStyles(order.reconciliationStatus)}`}
                    >
                      {getReconciliationLabel(order.reconciliationStatus)}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="glass-panel-soft rounded-2xl p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Billed
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {formatCurrency(order.totalAmount)}
                      </p>
                    </div>
                    <div className="glass-panel-soft rounded-2xl p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Received
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {formatCurrency(order.totalReceived)}
                      </p>
                    </div>
                    <div className="glass-panel-soft rounded-2xl p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Difference
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {order.balance > 0.01
                          ? `${formatCurrency(order.balance)} due`
                          : order.balance < -0.01
                            ? `${formatCurrency(Math.abs(order.balance))} extra`
                            : "Matched"}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="glass-panel rounded-[28px] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">
                Email Summary
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                Lifetime and today’s key metrics
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Open an email draft or copy the summary for WhatsApp, Gmail, or your reporting workflow.
              </p>
            </div>
            <div className="glass-chip rounded-2xl px-3 py-2 text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-700">
                To
              </p>
              <p className="max-w-[7rem] truncate text-sm font-semibold text-slate-900">
                {SUMMARY_EMAIL_TO || "Set env"}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => openMailDraft(emailSubject, emailBody)}
              className="glass-button-primary rounded-full px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Open Email Draft
            </button>
            <button
              onClick={() => void copyEmailSummary(emailBody)}
              className="glass-button-secondary rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:text-slate-900"
            >
              Copy Summary
            </button>
          </div>

          <pre className="mt-4 overflow-x-auto rounded-3xl bg-slate-950/90 p-4 text-xs leading-6 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
            {emailBody}
          </pre>
        </section>
      </div>
    </div>
  );
}
