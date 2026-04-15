export type PaymentMethod = "CASH" | "ONLINE" | "SPLIT";
export type PaymentEntryMethod = Exclude<PaymentMethod, "SPLIT">;
export type PaymentReceiver = "NEETA" | "TRUPTI" | "MULTIPLE";
export type PaymentActor = Exclude<PaymentReceiver, "MULTIPLE">;

export const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "ONLINE", "SPLIT"];
export const PAYMENT_ENTRY_METHODS: PaymentEntryMethod[] = ["CASH", "ONLINE"];
export const PAYMENT_RECEIVERS: PaymentReceiver[] = ["NEETA", "TRUPTI", "MULTIPLE"];
export const PAYMENT_ACTORS: PaymentActor[] = ["NEETA", "TRUPTI"];

export function getPaymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case "CASH":
      return "Cash";
    case "ONLINE":
      return "Online";
    case "SPLIT":
      return "Split";
    default:
      return method;
  }
}

export function getPaymentReceiverLabel(receiver: PaymentReceiver): string {
  switch (receiver) {
    case "NEETA":
      return "Neeta";
    case "TRUPTI":
      return "Trupti";
    case "MULTIPLE":
      return "Multiple";
    default:
      return receiver;
  }
}
