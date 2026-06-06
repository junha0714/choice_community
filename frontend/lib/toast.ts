export type ToastVariant = "success" | "error" | "info" | "warning";

export type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
};

type ToastListener = (toast: ToastItem) => void;

const listeners = new Set<ToastListener>();

let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `toast-${idCounter}-${Date.now()}`;
}

function emit(message: string, variant: ToastVariant, durationMs?: number) {
  const trimmed = message.trim();
  if (!trimmed) return;
  const item: ToastItem = {
    id: nextId(),
    message: trimmed,
    variant,
    durationMs: durationMs ?? (variant === "error" ? 5200 : 3600),
  };
  listeners.forEach((fn) => fn(item));
}

export function subscribeToasts(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const toast = {
  success: (message: string, durationMs?: number) =>
    emit(message, "success", durationMs),
  error: (message: string, durationMs?: number) =>
    emit(message, "error", durationMs),
  info: (message: string, durationMs?: number) => emit(message, "info", durationMs),
  warning: (message: string, durationMs?: number) =>
    emit(message, "warning", durationMs),
};
