"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Header from "@/components/Header";

type OrderStatus = "NEW" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";

type OrderItemRow = {
  id: number;
  name: string;
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

function parseItemName(rawName: string): { name: string; size: string } {
  const match = rawName.match(/^(.*)\s+\(([^()]+)\)$/);

  if (!match) {
    return { name: rawName, size: "Standard" };
  }

  return {
    name: match[1],
    size: match[2],
  };
}

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

      const parsedItem = parseItemName(item.name);
      const key = `${parsedItem.name}__${parsedItem.size}`;

      totalItems += item.qty;

      const existingItem = groupedItems.get(key);

      if (existingItem) {
        existingItem.qty += item.qty;
        existingItem.itemIds.push(item.id);
      } else {
        groupedItems.set(key, {
          key,
          name: parsedItem.name,
          size: parsedItem.size,
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
      className={`rounded-[24px] p-4 shadow-sm ${
        tone === "dark"
          ? "bg-slate-900 text-white"
          : "border border-slate-200 bg-white text-slate-900"
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

  useEffect(() => {
    let isMounted = true;

    const fetchOrders = async () => {
      setHasError(false);

      const { data, error } = await supabase
        .from("orders")
        .select("id, status, order_items(id, name, qty, packed)")
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
  const pickListItems = items;

  const handleMarkPacked = async (item: PickListItem) => {
    setSavingKeys((prev) => (prev.includes(item.key) ? prev : [...prev, item.key]));

    const { error } = await supabase
      .from("order_items")
      .update({ packed: true })
      .in("id", item.itemIds);

    if (error) {
      console.error("Mark packed error:", error);
      setHasError(true);
    }

    setSavingKeys((prev) => prev.filter((key) => key !== item.key));
  };

  const handleMarkAllPacked = async () => {
    const itemIds = pickListItems.flatMap((item) => item.itemIds);

    if (itemIds.length === 0) {
      return;
    }

    setSavingKeys(pickListItems.map((item) => item.key));

    const { error } = await supabase
      .from("order_items")
      .update({ packed: true })
      .in("id", itemIds);

    if (error) {
      console.error("Mark all packed error:", error);
      setHasError(true);
    }

    setSavingKeys([]);
  };

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[linear-gradient(180deg,_#fff7ed_0%,_#f8fafc_22%,_#f8fafc_100%)]">
      <Header
        title="Pick List"
        subtitle="Items to pack from all new and preparing orders."
      />

      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-5">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.45)]">
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
              disabled={pickListItems.length === 0 || isLoading || savingKeys.length > 0}
              className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingKeys.length > 0 ? "Saving..." : "Mark All Packed"}
            </button>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4">
          <SummaryCard
            label="Total Orders"
            value={summary.totalOrders}
            tone="dark"
          />
          <SummaryCard
            label="Total Items"
            value={summary.totalItems}
            tone="light"
          />
        </section>

        {isLoading ? (
          <section className="space-y-3">
            {[1, 2, 3].map((placeholder) => (
              <div
                key={placeholder}
                className="animate-pulse rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="h-5 w-2/3 rounded-full bg-slate-100" />
                <div className="mt-3 h-10 w-24 rounded-2xl bg-slate-100" />
                <div className="mt-4 h-12 rounded-2xl bg-slate-100" />
              </div>
            ))}
          </section>
        ) : hasError ? (
          <section className="rounded-[28px] border border-dashed border-red-200 bg-white/80 px-6 py-12 text-center shadow-sm">
            <p className="text-lg font-semibold text-slate-900">
              Pick list unavailable
            </p>
            <p className="mt-2 text-sm text-slate-500">
              We couldn&apos;t load the live pick list from Supabase.
            </p>
          </section>
        ) : pickListItems.length === 0 ? (
          <section className="rounded-[28px] border border-dashed border-slate-300 bg-white/80 px-6 py-12 text-center shadow-sm">
            <p className="text-lg font-semibold text-slate-900">
              Nothing left to pack
            </p>
            <p className="mt-2 text-sm text-slate-500">
              All active pick list items are packed.
            </p>
          </section>
        ) : (
          <section className="space-y-4 pb-6">
            {pickListItems.map((item) => (
              <article
                key={item.key}
                className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.45)]"
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
