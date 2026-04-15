"use client";

type ToastTone = "success" | "error" | "info";

export type ToastMessage = {
  id: number;
  title: string;
  description?: string;
  tone?: ToastTone;
};

const TONE_STYLES: Record<ToastTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-slate-200 bg-white text-slate-900",
};

export default function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 mx-auto flex w-full max-w-md flex-col gap-3 px-4">
      {toasts.map((toast) => {
        const tone = toast.tone ?? "info";

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-2xl border p-4 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.45)] backdrop-blur ${TONE_STYLES[tone]}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.description && (
                  <p className="mt-1 text-xs opacity-80">{toast.description}</p>
                )}
              </div>

              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="rounded-full px-2 py-1 text-xs font-medium opacity-70 transition hover:opacity-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
