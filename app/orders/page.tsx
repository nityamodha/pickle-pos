"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Header from "@/components/Header";

/* ================= TYPES ================= */

type OrderItem = {
  id: number;
  order_id: number;
  name: string;
  qty: number;
};

type OrderStatus =
  | "NEW"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED";

type OrderType = "DELIVERY" | "PICKUP";

type Order = {
  id: number;
  status: OrderStatus;
  created_at: string;
  name: string;
  phone: string;
  type: OrderType;
  address: string | null;
  order_items: OrderItem[];
};

/* ================= CONSTANTS ================= */

const STATUS_FLOW: OrderStatus[] = [
  "NEW",
  "PREPARING",
  "READY",
  "COMPLETED",
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
    fetchOrders();
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
    <div className="max-w-md mx-auto min-h-screen bg-gray-50">

      {/* 🔥 NAVIGATION */}
      <Header />

      {/* FILTER BAR */}
      <div className="p-3 bg-white border-b sticky top-[60px] z-10">
        <div className="flex gap-2 overflow-x-auto">
          {["ALL", ...STATUS_FLOW, "CANCELLED"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s as any)}
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
          <div
            key={order.id}
            className="bg-white p-4 rounded-xl shadow-sm"
          >

            {/* TOP */}
            <div className="flex justify-between mb-2">
              <div>
                <p className="font-semibold text-sm">
                  #{order.id} • {order.name}
                </p>
                <p className="text-xs text-gray-400">
                  {order.phone}
                </p>
              </div>

              <span className="text-xs px-2 py-1 rounded-full bg-gray-200">
                {order.status}
              </span>
            </div>

            {/* TYPE */}
            <p className="text-xs text-gray-500 mb-2">
              {order.type === "DELIVERY"
                ? "🚚 Delivery"
                : "🛍 Pickup"}
              {order.address && ` • ${order.address}`}
            </p>

            {/* ITEMS */}
            <div className="text-sm">
              {order.order_items?.map((item) => (
                <p key={item.id}>
                  {item.qty}× {item.name}
                </p>
              ))}
            </div>

            {/* ACTIONS */}
            <div className="flex justify-between items-center mt-3">

              <div className="flex gap-2">
                <button
                  onClick={() => updateStatus(order, "PREV")}
                  className="text-xs px-3 py-1 bg-gray-200 rounded-full"
                >
                  ← Prev
                </button>

                <button
                  onClick={() => updateStatus(order, "NEXT")}
                  className="text-xs px-3 py-1 bg-black text-white rounded-full"
                >
                  Next →
                </button>
              </div>

              {order.status !== "COMPLETED" &&
                order.status !== "CANCELLED" && (
                  <button
                    onClick={() => cancelOrder(order)}
                    className="text-xs text-red-600"
                  >
                    Cancel
                  </button>
                )}
            </div>

          </div>
        ))}
      </div>
    </div>
  );
}