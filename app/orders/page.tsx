"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

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

const STATUS: OrderStatus[] = [
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
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        () => fetchOrders()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  /* ================= STATUS ACTIONS ================= */

  const goNext = async (order: Order) => {
    if (order.status === "COMPLETED" || order.status === "CANCELLED") return;

    const index = STATUS.indexOf(order.status);
    const next = STATUS[index + 1];
    if (!next) return;

    const { error } = await supabase
      .from("orders")
      .update({ status: next })
      .eq("id", order.id);

    if (!error) fetchOrders();
    else console.error(error);
  };

  const goPrevious = async (order: Order) => {
    if (order.status === "NEW" || order.status === "CANCELLED") return;

    const index = STATUS.indexOf(order.status);
    const prev = STATUS[index - 1];
    if (!prev) return;

    const { error } = await supabase
      .from("orders")
      .update({ status: prev })
      .eq("id", order.id);

    if (!error) fetchOrders();
    else console.error(error);
  };

  const cancelOrder = async (order: Order) => {
    if (order.status === "CANCELLED") return;

    const { error } = await supabase
      .from("orders")
      .update({ status: "CANCELLED" })
      .eq("id", order.id);

    if (!error) fetchOrders();
    else console.error(error);
  };

  /* ================= FILTER ================= */

  const filteredOrders =
    filter === "ALL"
      ? orders
      : orders.filter((o) => o.status === filter);

  /* ================= UI ================= */

  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50">

      {/* HEADER */}
      <div className="p-4 bg-white border-b sticky top-0 z-10">
        <h1 className="text-lg font-bold">Orders</h1>

        <div className="flex gap-2 mt-2 overflow-x-auto">
          {["ALL", ...STATUS, "CANCELLED"].map((s) => (
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

      {/* LIST */}
      <div className="p-3 space-y-3">

        {filteredOrders.length === 0 && (
          <p className="text-center text-gray-400 mt-10">
            No orders
          </p>
        )}

        {filteredOrders.map((order) => (
          <div
            key={order.id}
            className="bg-white p-4 rounded-xl shadow-sm"
          >
            {/* HEADER */}
            <div className="flex justify-between items-start mb-2">

              <div>
                <p className="font-semibold text-sm">
                  #{order.id} • {order.name}
                </p>

                <p className="text-xs text-gray-400">
                  📞 {order.phone}
                </p>
              </div>

              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  order.status === "NEW"
                    ? "bg-blue-100 text-blue-600"
                    : order.status === "PREPARING"
                    ? "bg-yellow-100 text-yellow-600"
                    : order.status === "READY"
                    ? "bg-green-100 text-green-600"
                    : order.status === "COMPLETED"
                    ? "bg-gray-300 text-gray-700"
                    : "bg-red-100 text-red-600"
                }`}
              >
                {order.status}
              </span>
            </div>

            {/* ORDER TYPE */}
            <div className="text-xs text-gray-500 mb-2">
              {order.type === "DELIVERY"
                ? "🚚 Home Delivery"
                : "🛍 Pickup"}

              {order.address && (
                <span> • {order.address}</span>
              )}
            </div>

            {/* ITEMS */}
            <div className="mt-2 text-sm">
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
                  onClick={() => goPrevious(order)}
                  disabled={
                    order.status === "NEW" ||
                    order.status === "CANCELLED"
                  }
                  className="text-xs px-3 py-1 rounded-full bg-gray-200 disabled:opacity-40"
                >
                  ← Prev
                </button>

                <button
                  onClick={() => goNext(order)}
                  disabled={
                    order.status === "COMPLETED" ||
                    order.status === "CANCELLED"
                  }
                  className="text-xs bg-black text-white px-3 py-1 rounded-full disabled:opacity-40"
                >
                  Next →
                </button>
              </div>

              {order.status !== "CANCELLED" &&
                order.status !== "COMPLETED" && (
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