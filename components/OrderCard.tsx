import { getStatusIcon, getStatusLabel, getStatusStyles, type OrderStatus } from "@/lib/order-status";

type OrderItem = {
  id: number;
  order_id: number;
  name: string;
  qty: number;
};

type OrderType = "DELIVERY" | "PICKUP";

export type OrderCardData = {
  id: number;
  status: OrderStatus;
  created_at: string;
  name: string;
  phone: string;
  type: OrderType;
  address: string | null;
  order_items: OrderItem[];
};

type OrderCardProps = {
  order: OrderCardData;
  onPrevStatus: (order: OrderCardData) => void;
  onNextStatus: (order: OrderCardData) => void;
  onCancel: (order: OrderCardData) => void;
};

export default function OrderCard({
  order,
  onPrevStatus,
  onNextStatus,
  onCancel,
}: OrderCardProps) {
  const statusClassName = getStatusStyles(order.status);
  const statusIcon = getStatusIcon(order.status);
  const statusLabel = getStatusLabel(order.status);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            #{order.id} • {order.name}
          </p>
          <p className="text-xs text-gray-400">{order.phone}</p>
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

      <p className="mb-2 break-words text-xs text-gray-500">
        {order.type === "DELIVERY" ? "🚚 Delivery" : "🛍 Pickup"}
        {order.address && ` • ${order.address}`}
      </p>

      <div className="space-y-1 break-words text-sm">
        {order.order_items?.map((item) => (
          <p key={item.id}>
            {item.qty}× {item.name}
          </p>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onPrevStatus(order)}
            className="rounded-full bg-gray-200 px-3 py-1 text-xs"
          >
            ← Prev
          </button>

          <button
            onClick={() => onNextStatus(order)}
            className="rounded-full bg-black px-3 py-1 text-xs text-white"
          >
            Next →
          </button>
        </div>

        {order.status !== "COMPLETED" && order.status !== "CANCELLED" && (
          <button
            onClick={() => onCancel(order)}
            className="text-xs text-red-600"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

