"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import Header from "@/components/Header";
import ToastViewport, { type ToastMessage } from "@/components/ToastViewport";
import { formatOrderItemPrice, getOrderItemLabel } from "@/lib/order-items";
import {
  getPaymentMethodLabel,
  getPaymentReceiverLabel,
  PAYMENT_METHODS,
  PAYMENT_RECEIVERS,
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

type FinanceOrder = {
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

type PaymentDraft = {
  amount: string;
  method: PaymentMethod;
  receiver: PaymentReceiver;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

async function loadFinanceOrders() {
  return supabase
    .from("orders")
    .select(
      "id, created_at, name, phone, type, address, total, status, payment_received, payment_method, received_by, paid_at, order_items(id, product_name, size, unit_price, qty)"
    )
    .in("status", ["READY", "COMPLETED"])
    .order("created_at", { ascending: false });
}

function buildDraft(order: FinanceOrder): PaymentDraft {
  return {
    amount:
      order.payment_received !== null && order.payment_received !== undefined
        ? String(order.payment_received)
        : String(Number(order.total ?? 0)),
    method: order.payment_method ?? "CASH",
    receiver: order.received_by ?? "NEETA",
  };
}

export default function FinancePage() {
  const [orders, setOrders] = useState<FinanceOrder[]>([]);
  const [drafts, setDrafts] = useState<Record<number, PaymentDraft>>({});
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [savingOrderId, setSavingOrderId] = useState<number | null>(null);
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

  const loadAndSetOrders = async () => {
    const { data, error } = await loadFinanceOrders();

    if (error) {
      console.error("Finance orders fetch error:", error);
      pushToast(
        "Finance data unavailable",
        "We couldn’t load ready and completed orders. Confirm the payment columns exist in Supabase.",
        "error"
      );
      return;
    }

    const nextOrders = (data ?? []) as FinanceOrder[];
    setOrders(nextOrders);
    setDrafts((prev) => {
      const nextDrafts = { ...prev };

      for (const order of nextOrders) {
        nextDrafts[order.id] = prev[order.id] ?? buildDraft(order);
      }

      return nextDrafts;
    });
  };

  const refreshOrders = useEffectEvent(async () => {
    await loadAndSetOrders();
  });

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void refreshOrders();
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const ordersChannel = supabase
      .channel("finance-orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => void refreshOrders()
      )
      .subscribe();

    const itemsChannel = supabase
      .channel("finance-order-items-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => void refreshOrders()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(itemsChannel);
    };
  }, []);

  const updateDraft = <Key extends keyof PaymentDraft>(
    orderId: number,
    key: Key,
    value: PaymentDraft[Key]
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] ?? { amount: "", method: "CASH", receiver: "NEETA" }),
        [key]: value,
      },
    }));
  };

  const savePayment = async (order: FinanceOrder) => {
    const draft = drafts[order.id] ?? buildDraft(order);
    const amount = Number(draft.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      pushToast("Enter payment amount", `Add a valid amount for Order #${order.id}.`, "error");
      return;
    }

    setSavingOrderId(order.id);

    const { error } = await supabase
      .from("orders")
      .update({
        status: "COMPLETED",
        payment_received: amount,
        payment_method: draft.method,
        received_by: draft.receiver,
        paid_at: order.paid_at ?? new Date().toISOString(),
      })
      .eq("id", order.id);

    if (error) {
      console.error("Finance save error:", error);
      pushToast(
        "Payment save failed",
        `Order #${order.id} could not be updated. Confirm the finance columns exist in Supabase.`,
        "error"
      );
      setSavingOrderId(null);
      return;
    }

    pushToast(
      order.status === "COMPLETED" ? "Payment updated" : "Order completed",
      `Order #${order.id} has been saved under ${getPaymentReceiverLabel(draft.receiver)} via ${getPaymentMethodLabel(draft.method)}.`,
      "success"
    );
    setExpandedOrderId(null);
    setSavingOrderId(null);
    await loadAndSetOrders();
  };

  const readyOrders = orders.filter((order) => order.status === "READY");
  const completedOrders = orders.filter((order) => order.status === "COMPLETED");
  const totalCollected = completedOrders.reduce(
    (sum, order) => sum + Number(order.payment_received ?? 0),
    0
  );
  const cashCollected = completedOrders
    .filter((order) => order.payment_method === "CASH")
    .reduce((sum, order) => sum + Number(order.payment_received ?? 0), 0);
  const onlineCollected = completedOrders
    .filter((order) => order.payment_method === "ONLINE")
    .reduce((sum, order) => sum + Number(order.payment_received ?? 0), 0);

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[linear-gradient(180deg,_#ecfeff_0%,_#f8fafc_22%,_#f8fafc_100%)]">
      <ToastViewport
        toasts={toasts}
        onDismiss={(id) =>
          setToasts((prev) => prev.filter((toast) => toast.id !== id))
        }
      />

      <Header
        title="Finance Dashboard"
        subtitle="Close ready orders and record how payment was received."
      />

      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-5">
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">
              Ready To Close
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{readyOrders.length}</p>
          </div>
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
              Collected
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(totalCollected)}</p>
          </div>
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Split
            </p>
            <p className="mt-2 text-sm font-medium text-slate-700">
              Cash {formatCurrency(cashCollected)} • Online {formatCurrency(onlineCollected)}
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">
              Pending Payment
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              Ready orders waiting for finance
            </h2>
          </div>

          {readyOrders.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/80 px-6 py-10 text-center shadow-sm">
              <p className="text-lg font-semibold text-slate-900">Nothing pending</p>
              <p className="mt-2 text-sm text-slate-500">
                Orders moved to READY will appear here for payment collection.
              </p>
            </div>
          ) : (
            readyOrders.map((order) => {
              const draft = drafts[order.id] ?? buildDraft(order);
              const isExpanded = expandedOrderId === order.id;
              const statusClassName = getStatusStyles(order.status);
              const statusIcon = getStatusIcon(order.status);
              const statusLabel = getStatusLabel(order.status);

              return (
                <div
                  key={order.id}
                  className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.45)]"
                >
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

                    <span
                      aria-label={`Order status: ${statusLabel}`}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${statusClassName}`}
                    >
                      <span aria-hidden="true" className="text-[10px] leading-none">
                        {statusIcon}
                      </span>
                      <span>{order.status}</span>
                    </span>
                  </div>

                  <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Items
                      </p>
                      <p className="text-sm font-semibold text-slate-900">
                        {formatCurrency(Number(order.total ?? 0))}
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

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">
                      Created {formatDateTime(order.created_at)}
                    </p>
                    <button
                      onClick={() =>
                        setExpandedOrderId((current) =>
                          current === order.id ? null : order.id
                        )
                      }
                      className="rounded-full bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800"
                    >
                      {isExpanded ? "Hide payment" : "Record payment"}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 space-y-3 rounded-3xl border border-cyan-100 bg-cyan-50/70 p-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Amount
                          <input
                            value={draft.amount}
                            onChange={(event) =>
                              updateDraft(order.id, "amount", event.target.value)
                            }
                            inputMode="decimal"
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none transition focus:border-cyan-400"
                          />
                        </label>

                        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Method
                          <select
                            value={draft.method}
                            onChange={(event) =>
                              updateDraft(
                                order.id,
                                "method",
                                event.target.value as PaymentMethod
                              )
                            }
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none transition focus:border-cyan-400"
                          >
                            {PAYMENT_METHODS.map((method) => (
                              <option key={method} value={method}>
                                {getPaymentMethodLabel(method)}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Received By
                          <select
                            value={draft.receiver}
                            onChange={(event) =>
                              updateDraft(
                                order.id,
                                "receiver",
                                event.target.value as PaymentReceiver
                              )
                            }
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none transition focus:border-cyan-400"
                          >
                            {PAYMENT_RECEIVERS.map((receiver) => (
                              <option key={receiver} value={receiver}>
                                {getPaymentReceiverLabel(receiver)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <button
                        onClick={() => void savePayment(order)}
                        disabled={savingOrderId === order.id}
                        className="w-full rounded-2xl bg-cyan-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-cyan-300"
                      >
                        {savingOrderId === order.id ? "Saving..." : "Mark completed"}
                      </button>
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
                Completed Orders
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                Payment log
              </h2>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                Logged
              </p>
              <p className="text-lg font-semibold text-slate-900">
                {completedOrders.length}
              </p>
            </div>
          </div>

          {completedOrders.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/80 px-6 py-10 text-center shadow-sm">
              <p className="text-lg font-semibold text-slate-900">No payments logged</p>
              <p className="mt-2 text-sm text-slate-500">
                Completed orders with payment details will appear here.
              </p>
            </div>
          ) : (
            completedOrders.map((order) => (
              <div
                key={order.id}
                className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.35)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      #{order.id} • {order.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {order.paid_at ? `Paid ${formatDateTime(order.paid_at)}` : "Payment time not recorded"}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {formatCurrency(Number(order.payment_received ?? 0))}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {getPaymentMethodLabel(order.payment_method ?? "CASH")}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {getPaymentReceiverLabel(order.received_by ?? "NEETA")}
                  </span>
                  <button
                    onClick={() =>
                      setExpandedOrderId((current) =>
                        current === order.id ? null : order.id
                      )
                    }
                    className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                  >
                    {expandedOrderId === order.id ? "Hide edit" : "Edit payment"}
                  </button>
                </div>

                {expandedOrderId === order.id && (
                  <div className="mt-4 space-y-3 rounded-3xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Amount
                        <input
                          value={(drafts[order.id] ?? buildDraft(order)).amount}
                          onChange={(event) =>
                            updateDraft(order.id, "amount", event.target.value)
                          }
                          inputMode="decimal"
                          className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none transition focus:border-emerald-400"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Method
                        <select
                          value={(drafts[order.id] ?? buildDraft(order)).method}
                          onChange={(event) =>
                            updateDraft(
                              order.id,
                              "method",
                              event.target.value as PaymentMethod
                            )
                          }
                          className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none transition focus:border-emerald-400"
                        >
                          {PAYMENT_METHODS.map((method) => (
                            <option key={method} value={method}>
                              {getPaymentMethodLabel(method)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Received By
                        <select
                          value={(drafts[order.id] ?? buildDraft(order)).receiver}
                          onChange={(event) =>
                            updateDraft(
                              order.id,
                              "receiver",
                              event.target.value as PaymentReceiver
                            )
                          }
                          className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none transition focus:border-emerald-400"
                        >
                          {PAYMENT_RECEIVERS.map((receiver) => (
                            <option key={receiver} value={receiver}>
                              {getPaymentReceiverLabel(receiver)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <button
                      onClick={() => void savePayment(order)}
                      disabled={savingOrderId === order.id}
                      className="w-full rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
                    >
                      {savingOrderId === order.id ? "Saving..." : "Update payment"}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
