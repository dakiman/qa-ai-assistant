/**
 * Minimal dependency-free toast store.
 *
 * A tiny external store (pub/sub) so both React components and non-React code
 * (the TanStack MutationCache global error handler) can raise toasts. Rendered
 * by <Toaster/>. This replaces the app's previous pattern of swallowing
 * mutation failures to console.error with no user feedback (M17).
 */

export type ToastVariant = 'error' | 'success' | 'info';

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

const AUTO_DISMISS_MS = 5000;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToasts(): Toast[] {
  return toasts;
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function toast(message: string, variant: ToastVariant = 'info'): number {
  const id = nextId++;
  toasts = [...toasts, { id, message, variant }];
  emit();
  if (typeof window !== 'undefined') {
    window.setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
  }
  return id;
}
