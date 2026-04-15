export type OrderStatus =
  | "NEW"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED";

type StatusPresentation = {
  badgeClassName: string;
  icon: string;
  label: string;
};

const STATUS_STYLES: Record<OrderStatus, StatusPresentation> = {
  NEW: {
    badgeClassName:
      "border border-blue-200 bg-blue-100 text-blue-700",
    icon: "🔵",
    label: "New",
  },
  PREPARING: {
    badgeClassName:
      "border border-amber-200 bg-amber-100 text-amber-700",
    icon: "⏳",
    label: "Preparing",
  },
  READY: {
    badgeClassName:
      "border border-green-200 bg-green-100 text-green-700",
    icon: "✅",
    label: "Ready",
  },
  COMPLETED: {
    badgeClassName:
      "border border-gray-300 bg-gray-200 text-gray-600",
    icon: "✔️",
    label: "Completed",
  },
  CANCELLED: {
    badgeClassName:
      "border border-red-200 bg-red-100 text-red-700",
    icon: "✖",
    label: "Cancelled",
  },
};

const FALLBACK_STATUS: StatusPresentation = {
  badgeClassName:
    "border border-gray-300 bg-gray-100 text-gray-600",
  icon: "•",
  label: "Unknown",
};

export function getStatusStyles(status: string): string {
  return (
    STATUS_STYLES[status as OrderStatus]?.badgeClassName ??
    FALLBACK_STATUS.badgeClassName
  );
}

export function getStatusIcon(status: string): string {
  return STATUS_STYLES[status as OrderStatus]?.icon ?? FALLBACK_STATUS.icon;
}

export function getStatusLabel(status: string): string {
  return STATUS_STYLES[status as OrderStatus]?.label ?? FALLBACK_STATUS.label;
}

