export type PaymentMethod = "CASH" | "ONLINE";
export type PaymentReceiver = "NEETA" | "TRUPTI";

export const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "ONLINE"];
export const PAYMENT_RECEIVERS: PaymentReceiver[] = ["NEETA", "TRUPTI"];

export function getPaymentMethodLabel(method: PaymentMethod): string {
  return method === "CASH" ? "Cash" : "Online";
}

export function getPaymentReceiverLabel(receiver: PaymentReceiver): string {
  return receiver === "NEETA" ? "Neeta" : "Trupti";
}
