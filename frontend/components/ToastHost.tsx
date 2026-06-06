"use client";

import { useEffect, useState } from "react";
import {
  subscribeToasts,
  type ToastItem,
  type ToastVariant,
} from "@/lib/toast";

const VARIANT_CLASS: Record<ToastVariant, string> = {
  success:
    "border-emerald-200/90 bg-emerald-50/95 text-emerald-950 shadow-emerald-900/10 dark:border-emerald-900/45 dark:bg-emerald-950/90 dark:text-emerald-50",
  error:
    "border-red-200/90 bg-red-50/95 text-red-950 shadow-red-900/10 dark:border-red-900/45 dark:bg-red-950/90 dark:text-red-50",
  info: "border-sky-200/90 bg-sky-50/95 text-sky-950 shadow-sky-900/10 dark:border-sky-900/45 dark:bg-sky-950/90 dark:text-sky-50",
  warning:
    "border-amber-200/90 bg-amber-50/95 text-amber-950 shadow-amber-900/10 dark:border-amber-900/45 dark:bg-amber-950/90 dark:text-amber-50",
};

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(item.id), item.durationMs);
    return () => window.clearTimeout(timer);
  }, [item.durationMs, item.id, onDismiss]);

  return (
    <div
      role={item.variant === "error" ? "alert" : "status"}
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border px-3.5 py-3 text-sm leading-snug shadow-lg backdrop-blur-sm transition ${VARIANT_CLASS[item.variant]}`}
    >
      <p className="min-w-0 flex-1 whitespace-pre-wrap">{item.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold opacity-70 transition hover:opacity-100"
        aria-label="닫기"
      >
        ✕
      </button>
    </div>
  );
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribeToasts((item) => {
      setItems((prev) => [...prev.slice(-4), item]);
    });
  }, []);

  const dismiss = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6"
    >
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={dismiss} />
      ))}
    </div>
  );
}
