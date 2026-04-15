import {
  getPaymentMethodLabel,
  getPaymentReceiverLabel,
  type PaymentEntryMethod,
  type PaymentMethod,
  type PaymentReceiver,
} from "@/lib/payment";

export type ReconciliationStatus =
  | "UNPAID"
  | "UNDERPAID"
  | "SETTLED"
  | "OVERPAID";

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function getDateKey(date: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getReconciliationStatus(
  totalAmount: number,
  receivedAmount: number
): ReconciliationStatus {
  const balance = roundCurrency(totalAmount - receivedAmount);

  if (receivedAmount <= 0) {
    return "UNPAID";
  }

  if (Math.abs(balance) < 0.01) {
    return "SETTLED";
  }

  return balance > 0 ? "UNDERPAID" : "OVERPAID";
}

export function getReconciliationLabel(status: ReconciliationStatus): string {
  switch (status) {
    case "UNPAID":
      return "Unpaid";
    case "UNDERPAID":
      return "Underpaid";
    case "SETTLED":
      return "Settled";
    case "OVERPAID":
      return "Overpaid";
    default:
      return status;
  }
}

export function getReconciliationStyles(status: ReconciliationStatus): string {
  switch (status) {
    case "UNPAID":
      return "border border-slate-200 bg-slate-100 text-slate-700";
    case "UNDERPAID":
      return "border border-amber-200 bg-amber-100 text-amber-700";
    case "SETTLED":
      return "border border-emerald-200 bg-emerald-100 text-emerald-700";
    case "OVERPAID":
      return "border border-rose-200 bg-rose-100 text-rose-700";
    default:
      return "border border-slate-200 bg-slate-100 text-slate-700";
  }
}

export function summarisePaymentMethod(
  methods: PaymentEntryMethod[]
): PaymentMethod | null {
  const uniqueMethods = Array.from(new Set(methods));

  if (uniqueMethods.length === 0) {
    return null;
  }

  return uniqueMethods.length === 1 ? uniqueMethods[0] : "SPLIT";
}

export function summarisePaymentReceiver(
  receivers: Exclude<PaymentReceiver, "MULTIPLE">[]
): PaymentReceiver | null {
  const uniqueReceivers = Array.from(new Set(receivers));

  if (uniqueReceivers.length === 0) {
    return null;
  }

  return uniqueReceivers.length === 1 ? uniqueReceivers[0] : "MULTIPLE";
}

export function describePaymentSplit(
  methods: PaymentEntryMethod[],
  receivers: Exclude<PaymentReceiver, "MULTIPLE">[]
): string {
  const methodLabel = summarisePaymentMethod(methods);
  const receiverLabel = summarisePaymentReceiver(receivers);

  return [
    methodLabel ? getPaymentMethodLabel(methodLabel) : null,
    receiverLabel ? getPaymentReceiverLabel(receiverLabel) : null,
  ]
    .filter(Boolean)
    .join(" • ");
}
