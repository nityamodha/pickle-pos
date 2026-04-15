"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Header from "@/components/Header";
import OrderCard, { type OrderCardData } from "@/components/OrderCard";
import { type OrderStatus } from "@/lib/order-status";

/* ================= TYPES ================= */
type Order = OrderCardData;

/* ================= CONSTANTS ================= */

const STATUS_FLOW: OrderStatus[] = [
  "NEW",
  "PREPARING",
  "READY",
  "COMPLETED",
];

const FILTER_OPTIONS: Array<"ALL" | OrderStatus> = [
  "ALL",
  ...STATUS_FLOW,
  "CANCELLED",
];

/* ================= COMPONENT ================= */

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<"ALL" | OrderStatus>("ALL");

  /* ================= FETCH ================= */

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(`*, order_items (*)`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch error:", error);
      return;
    }

    setOrders(data || []);
  };

  /* ================= INIT ================= */

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void fetchOrders();
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  /* ================= REALTIME ================= */

  useEffect(() => {
    const channel = supabase
      .channel("orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => fetchOrders()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  /* ================= ACTIONS ================= */

  const updateStatus = async (order: Order, direction: "NEXT" | "PREV") => {
    if (order.status === "CANCELLED") return;

    const index = STATUS_FLOW.indexOf(order.status);
    let nextStatus: OrderStatus | undefined;

    if (direction === "NEXT") {
      nextStatus = STATUS_FLOW[index + 1];
    } else {
      nextStatus = STATUS_FLOW[index - 1];
    }

    if (!nextStatus) return;

    const { error } = await supabase
      .from("orders")
      .update({ status: nextStatus })
      .eq("id", order.id);

    if (!error) fetchOrders();
  };

  const cancelOrder = async (order: Order) => {
    if (order.status === "CANCELLED") return;

    const { error } = await supabase
      .from("orders")
      .update({ status: "CANCELLED" })
      .eq("id", order.id);

    if (!error) fetchOrders();
  };

  /* ================= FILTER ================= */

  const filtered =
    filter === "ALL"
      ? orders
      : orders.filter((o) => o.status === filter);

  /* ================= UI ================= */

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[linear-gradient(180deg,_#fff7ed_0%,_#f8fafc_22%,_#f8fafc_100%)]">

      {/* 🔥 NAVIGATION */}
      <Header
        title="Orders Dashboard"
        subtitle="Track every order from incoming to completed."
      />

      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-5">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.45)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">
                Live Queue
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                Manage active orders
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Filter by status and move orders forward as the kitchen updates.
              </p>
            </div>
            <div className="rounded-2xl bg-orange-50 px-3 py-2 text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-600">
                Showing
              </p>
              <p className="text-lg font-semibold text-slate-900">
                {filtered.length}
              </p>
            </div>
          </div>
        </section>

        <section className="sticky top-[126px] z-10 rounded-[24px] border border-slate-200 bg-white/95 p-3 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.45)] backdrop-blur">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {FILTER_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold tracking-wide transition ${
                  filter === s
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4 pb-6">
          {filtered.length === 0 && (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/80 px-6 py-12 text-center shadow-sm">
              <p className="text-lg font-semibold text-slate-900">No orders</p>
              <p className="mt-2 text-sm text-slate-500">
                New orders will appear here as they come in.
              </p>
            </div>
          )}

          {filtered.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onPrevStatus={(currentOrder) =>
                void updateStatus(currentOrder, "PREV")
              }
              onNextStatus={(currentOrder) =>
                void updateStatus(currentOrder, "NEXT")
              }
              onCancel={(currentOrder) => void cancelOrder(currentOrder)}
            />
          ))}
        </section>
      </div>
    </div>
  );
}
