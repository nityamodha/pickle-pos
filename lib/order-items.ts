export type OrderItemRecord = {
  id: number;
  order_id?: number;
  product_name: string;
  size: string;
  unit_price: number | null;
  qty: number;
  packed?: boolean;
};

export function getOrderItemLabel(item: Pick<OrderItemRecord, "product_name" | "size">): string {
  return `${item.product_name} (${item.size})`;
}

export function formatOrderItemPrice(unitPrice: number | null, qty: number): string | null {
  if (unitPrice == null) {
    return null;
  }

  const total = unitPrice * qty;

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(total);
}
