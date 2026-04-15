"use client";

import { useEffect, useRef, useState } from "react";
import ToastViewport, { type ToastMessage } from "@/components/ToastViewport";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";

type OrderStatus = "NEW" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";

type OrderItemRow = {
  id: number;
  product_name: string;
  size: string;
  qty: number;
  packed: boolean;
};

type Order = {
  id: number;
  status: OrderStatus;
  order_items: OrderItemRow[];
};

type PickListItem = {
  key: string;
  name: string;
  size: string;
  qty: number;
  itemIds: number[];
};

type PickListSummary = {
  totalOrders: number;
  totalItems: number;
};

function aggregatePickList(orders: Order[]): {
  summary: PickListSummary;
  items: PickListItem[];
} {
  const activeOrders = orders.filter(
    (order) => order.status === "NEW" || order.status === "PREPARING"
  );

  const groupedItems = new Map<string, PickListItem>();
  let totalItems = 0;

  for (const order of activeOrders) {
    for (const item of order.order_items ?? []) {
      if (item.packed) {
        continue;
      }

      const key = `${item.product_name}__${item.size}`;
      totalItems += item.qty;

      const existing = groupedItems.get(key);

      if (existing) {
        existing.qty += item.qty;
        existing.itemIds.push(item.id);
      } else {
        groupedItems.set(key, {
          key,
          name: item.product_name,
          size: item.size,
          qty: item.qty,
          itemIds: [item.id],
        });
      }
    }
  }

  return {
    summary: {
      totalOrders: activeOrders.length,
      totalItems,
    },
    items: Array.from(groupedItems.values()).sort((a, b) => b.qty - a.qty),
  };
}

function getQuantityStyles(qty: number): string {
  if (qty >= 5) {
    return "border border-red-200 bg-red-50 text-red-700";
  }

  if (qty >= 3) {
    return "border border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border border-emerald-200 bg-emerald-50 text-emerald-700";
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "dark" | "light";
}) {
  return (
    <div
      className={`rounded-[24px] p-4 ${
        tone === "dark"
          ? "glass-button-primary text-white"
          : "glass-panel-soft text-slate-900"
      }`}
    >
      <p
        className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
          tone === "dark" ? "text-slate-300" : "text-slate-400"
        }`}
      >
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

export default function PickListPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [savingKeys, setSavingKeys] = useState<string[]>([]);
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

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      setHasError(false);

      const { data, error } = await supabase
        .from("orders")
        .select("id, status, order_items(id, product_name, size, qty, packed)")
        .order("created_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("Pick list fetch error:", error);
        setHasError(true);
        setIsLoading(false);
        return;
      }

      setOrders((data ?? []) as Order[]);
      setIsLoading(false);
    };

    void fetchOrders();

    const ordersChannel = supabase
      .channel("pick-list-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => void fetchOrders()
      )
      .subscribe();

    const itemsChannel = supabase
      .channel("pick-list-items")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => void fetchOrders()
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(itemsChannel);
    };
  }, []);

  const { summary, items } = aggregatePickList(orders);

  const handleMarkPacked = async (item: PickListItem) => {
    setSavingKeys((prev) => (prev.includes(item.key) ? prev : [...prev, item.key]));

    const { error } = await supabase
      .from("order_items")
      .update({ packed: true })
      .in("id", item.itemIds);

    if (error) {
      console.error("Mark packed error:", error);
      setHasError(true);
      pushToast("Pack failed", `${item.name} (${item.size}) could not be marked as packed.`, "error");
      setSavingKeys((prev) => prev.filter((key) => key !== item.key));
      return;
    }

    pushToast("Item packed", `${item.qty} units of ${item.name} (${item.size}) moved out of the live list.`, "success");
    setSavingKeys((prev) => prev.filter((key) => key !== item.key));
  };

  const handleMarkAllPacked = async () => {
    const itemIds = items.flatMap((item) => item.itemIds);

    if (itemIds.length === 0) {
      return;
    }

    setSavingKeys(items.map((item) => item.key));

    const { error } = await supabase
      .from("order_items")
      .update({ packed: true })
      .in("id", itemIds);

    if (error) {
      console.error("Mark all packed error:", error);
      setHasError(true);
      pushToast("Bulk pack failed", "We couldn’t mark the whole pick list as packed.", "error");
      setSavingKeys([]);
      return;
    }

    pushToast("Pick list cleared", `${itemIds.length} line items were marked as packed.`, "success");
    setSavingKeys([]);
  };

  return (
    <div className="glass-page min-h-dvh overflow-x-hidden">
      <ToastViewport
        toasts={toasts}
        onDismiss={(id) =>
          setToasts((prev) => prev.filter((toast) => toast.id !== id))
        }
      />

      <Header
        title="Pick List"
        subtitle="Items to pack from all new and preparing orders."
      />

      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-5">
        <section className="glass-panel rounded-[28px] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">
                Active Packing Queue
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                Pack what the kitchen needs next
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Aggregated items from all new and preparing orders.
              </p>
            </div>

            <button
              onClick={() => void handleMarkAllPacked()}
              disabled={items.length === 0 || isLoading || savingKeys.length > 0}
              className="glass-button-primary rounded-xl px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingKeys.length > 0 ? "Saving..." : "Mark All Packed"}
            </button>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4">
          <SummaryCard label="Total Orders" value={summary.totalOrders} tone="dark" />
          <SummaryCard label="Total Items" value={summary.totalItems} tone="light" />
        </section>

        {isLoading ? (
          <section className="space-y-3">
            {[1, 2, 3].map((placeholder) => (
              <div
                key={placeholder}
                className="glass-panel animate-pulse rounded-[28px] p-5"
              >
                <div className="h-5 w-2/3 rounded-full bg-white/70" />
                <div className="mt-3 h-10 w-24 rounded-2xl bg-white/70" />
                <div className="mt-4 h-12 rounded-2xl bg-white/70" />
              </div>
            ))}
          </section>
        ) : hasError ? (
          <section className="glass-panel-soft rounded-[28px] border border-dashed border-white/70 px-6 py-12 text-center">
            <p className="text-lg font-semibold text-slate-900">
              Pick list unavailable
            </p>
            <p className="mt-2 text-sm text-slate-500">
              We couldn&apos;t load the live pick list from Supabase.
            </p>
          </section>
        ) : items.length === 0 ? (
          <section className="glass-panel-soft rounded-[28px] border border-dashed border-white/70 px-6 py-12 text-center">
            <p className="text-lg font-semibold text-slate-900">
              Nothing left to pack
            </p>
            <p className="mt-2 text-sm text-slate-500">
              All active pick list items are packed.
            </p>
          </section>
        ) : (
          <section className="space-y-4 pb-6">
            {items.map((item) => (
              <article
                key={item.key}
                className="glass-panel rounded-[28px] p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600">
                      Pick Item
                    </p>
                    <h3 className="mt-1 text-xl font-semibold text-slate-900">
                      {item.name}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">{item.size}</p>
                  </div>

                  <div
                    className={`inline-flex min-w-24 flex-col items-center rounded-2xl px-4 py-3 text-center ${getQuantityStyles(
                      item.qty
                    )}`}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
                      Qty
                    </span>
                    <span className="mt-1 text-3xl font-semibold leading-none">
                      {item.qty}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => void handleMarkPacked(item)}
                  disabled={savingKeys.includes(item.key)}
                  className="mt-5 w-full rounded-2xl bg-slate-900 py-4 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingKeys.includes(item.key) ? "Saving..." : "Mark Packed"}
                </button>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
