"use client";

import { useEffect, useRef, useState } from "react";
import ToastViewport, { type ToastMessage } from "@/components/ToastViewport";
import Header from "@/components/Header";
import OrderCard, { type OrderCardData } from "@/components/OrderCard";
import { type OrderStatus } from "@/lib/order-status";
import { supabase } from "@/lib/supabase";

type Order = OrderCardData;

const STATUS_FLOW: OrderStatus[] = [
  "NEW",
  "PREPARING",
  "READY",
];

const FILTER_OPTIONS: Array<"ALL" | OrderStatus> = [
  "ALL",
  ...STATUS_FLOW,
  "CANCELLED",
];

async function loadOrders() {
  return supabase
    .from("orders")
    .select("*, order_items(id, order_id, product_name, size, unit_price, qty)")
    .order("created_at", { ascending: false });
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<"ALL" | OrderStatus>("ALL");
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
    const fetchOrders = async () => {
      const { data, error } = await loadOrders();

      if (error) {
        console.error("Fetch error:", error);
        pushToast("Orders unavailable", "We couldn’t load the live queue right now.", "error");
        return;
      }

      setOrders((data ?? []) as Order[]);
    };

    const frame = requestAnimationFrame(() => {
      void fetchOrders();
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const refreshOrders = async () => {
      const { data, error } = await loadOrders();

      if (error) {
        console.error("Fetch error:", error);
        return;
      }

      setOrders((data ?? []) as Order[]);
    };

    const ordersChannel = supabase
      .channel("orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => void refreshOrders()
      )
      .subscribe();

    const itemsChannel = supabase
      .channel("order-items-realtime")
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

  const updateStatus = async (order: Order, direction: "NEXT" | "PREV") => {
    if (order.status === "CANCELLED") {
      return;
    }

    const index = STATUS_FLOW.indexOf(order.status);
    const nextStatus =
      direction === "NEXT"
        ? STATUS_FLOW[index + 1]
        : STATUS_FLOW[index - 1];

    if (!nextStatus) {
      if (direction === "NEXT" && order.status === "READY") {
        pushToast(
          "Ready for finance",
          `Record payment for Order #${order.id} from the Finance dashboard before completing it.`,
          "info"
        );
      }
      return;
    }

    const { error } = await supabase
      .from("orders")
      .update({ status: nextStatus })
      .eq("id", order.id);

    if (error) {
      console.error("Status update error:", error);
      pushToast("Status update failed", `Order #${order.id} could not be moved to ${nextStatus}.`, "error");
      return;
    }

    pushToast("Status updated", `Order #${order.id} is now ${nextStatus}.`, "success");
    const { data } = await loadOrders();
    setOrders((data ?? []) as Order[]);
  };

  const cancelOrder = async (order: Order) => {
    if (order.status === "CANCELLED") {
      return;
    }

    const { error } = await supabase
      .from("orders")
      .update({ status: "CANCELLED" })
      .eq("id", order.id);

    if (error) {
      console.error("Cancel error:", error);
      pushToast("Cancel failed", `Order #${order.id} could not be cancelled.`, "error");
      return;
    }

    pushToast("Order cancelled", `Order #${order.id} was removed from the active queue.`, "success");
    const { data } = await loadOrders();
    setOrders((data ?? []) as Order[]);
  };

  const filtered =
    filter === "ALL"
      ? orders
      : orders.filter((order) => order.status === filter);

  return (
    <div className="glass-page min-h-dvh overflow-x-hidden">
      <ToastViewport
        toasts={toasts}
        onDismiss={(id) =>
          setToasts((prev) => prev.filter((toast) => toast.id !== id))
        }
      />

      <Header
        title="Orders Dashboard"
        subtitle="Track every order from incoming to completed."
      />

      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-5">
        <section className="glass-panel rounded-[28px] p-5">
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
            <div className="glass-chip rounded-2xl px-3 py-2 text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-600">
                Showing
              </p>
              <p className="text-lg font-semibold text-slate-900">
                {filtered.length}
              </p>
            </div>
          </div>
        </section>

        <section className="glass-panel sticky top-[126px] z-10 rounded-[24px] p-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {FILTER_OPTIONS.map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold tracking-wide transition ${
                  filter === status
                    ? "glass-button-primary text-white"
                    : "glass-button-secondary text-slate-600 hover:text-slate-900"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4 pb-6">
          {filtered.length === 0 && (
            <div className="glass-panel-soft rounded-[28px] border border-dashed border-white/70 px-6 py-12 text-center">
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
              nextLabel={
                order.status === "READY" ? "Finance only" : "Next →"
              }
              nextDisabled={order.status === "READY"}
            />
          ))}
        </section>
      </div>
    </div>
  );
}
