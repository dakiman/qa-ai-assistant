'use client';

import { useSyncExternalStore } from 'react';
import { X, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getToasts, subscribe, dismissToast, type ToastVariant } from '@/lib/toast';

const EMPTY: ReturnType<typeof getToasts> = [];

const VARIANT_STYLES: Record<ToastVariant, string> = {
  error: 'border-destructive/50 bg-destructive/10 text-destructive',
  success: 'border-green-500/50 bg-green-500/10 text-green-400',
  info: 'border-border bg-card text-foreground',
};

const VARIANT_ICON = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
} as const;

export function Toaster() {
  // Server snapshot is always empty to avoid a hydration mismatch — toasts are
  // only ever created client-side.
  const toasts = useSyncExternalStore(subscribe, getToasts, () => EMPTY);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => {
        const Icon = VARIANT_ICON[t.variant];
        return (
          <div
            key={t.id}
            role="alert"
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3 shadow-lg backdrop-blur-sm',
              'animate-in slide-in-from-right-4 duration-200',
              VARIANT_STYLES[t.variant]
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="flex-1 text-sm break-words">{t.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 opacity-70 transition-opacity hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
