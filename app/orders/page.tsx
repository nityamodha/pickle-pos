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
    <div className="w-full max-w-md mx-auto min-h-dvh bg-gray-50 overflow-x-hidden">

      {/* 🔥 NAVIGATION */}
      <Header />

      {/* FILTER BAR */}
      <div className="sticky top-[60px] z-10 border-b bg-white p-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTER_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded-full text-xs whitespace-nowrap ${
                filter === s
                  ? "bg-black text-white"
                  : "bg-gray-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ORDERS LIST */}
      <div className="p-3 space-y-3">

        {filtered.length === 0 && (
          <p className="text-center text-gray-400 mt-10">
            No orders
          </p>
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
      </div>
    </div>
  );
}
