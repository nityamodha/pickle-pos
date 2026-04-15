import { getStatusIcon, getStatusLabel, getStatusStyles, type OrderStatus } from "@/lib/order-status";
import { formatOrderItemPrice, getOrderItemLabel } from "@/lib/order-items";

type OrderItem = {
  id: number;
  order_id: number;
  product_name: string;
  size: string;
  unit_price: number | null;
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
  nextLabel?: string;
  nextDisabled?: boolean;
};

export default function OrderCard({
  order,
  onPrevStatus,
  onNextStatus,
  onCancel,
  nextLabel = "Next →",
  nextDisabled = false,
}: OrderCardProps) {
  const statusClassName = getStatusStyles(order.status);
  const statusIcon = getStatusIcon(order.status);
  const statusLabel = getStatusLabel(order.status);

  return (
    <div className="glass-panel overflow-hidden rounded-[28px] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            #{order.id} • {order.name}
          </p>
          <p className="mt-1 text-xs text-slate-400">{order.phone}</p>
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

      <p className="mb-3 break-words text-xs text-slate-500">
        {order.type === "DELIVERY" ? "🚚 Delivery" : "🛍 Pickup"}
        {order.address && ` • ${order.address}`}
      </p>

      <div className="glass-panel-soft rounded-2xl p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          Items
        </p>
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onPrevStatus(order)}
            className="glass-button-secondary rounded-full px-3 py-2 text-xs font-medium text-slate-700 transition hover:text-slate-900"
          >
            ← Prev
          </button>

          <button
            onClick={() => onNextStatus(order)}
            disabled={nextDisabled}
            className={`rounded-full px-3 py-2 text-xs font-medium transition ${
              nextDisabled
                ? "cursor-not-allowed border border-white/60 bg-white/45 text-slate-500"
                : "glass-button-primary text-white hover:brightness-110"
            }`}
          >
            {nextLabel}
          </button>
        </div>

        {order.status !== "COMPLETED" && order.status !== "CANCELLED" && (
          <button
            onClick={() => onCancel(order)}
            className="text-xs font-medium text-red-600 transition hover:text-red-700"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
