'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { IconAlert, IconCheck, IconClose, IconInfo } from '@/components/icons';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  push: (toast: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { bar: string; icon: ReactNode; iconColor: string }> = {
  success: { bar: 'bg-positive', icon: <IconCheck />, iconColor: 'text-positive' },
  error: { bar: 'bg-negative', icon: <IconAlert />, iconColor: 'text-negative' },
  warning: { bar: 'bg-warning', icon: <IconAlert />, iconColor: 'text-warning' },
  info: { bar: 'bg-accent', icon: <IconInfo />, iconColor: 'text-accent' },
};

const AUTO_DISMISS_MS: Record<ToastTone, number> = {
  success: 4000,
  info: 5000,
  warning: 8000,
  error: 9000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS[toast.tone]);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (title, description) => push({ tone: 'success', title, ...(description ? { description } : {}) }),
      error: (title, description) => push({ tone: 'error', title, ...(description ? { description } : {}) }),
      warning: (title, description) => push({ tone: 'warning', title, ...(description ? { description } : {}) }),
      info: (title, description) => push({ tone: 'info', title, ...(description ? { description } : {}) }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        // No celular os avisos sobem acima da barra de navegação inferior.
        className="pointer-events-none fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[100] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:w-[min(24rem,calc(100vw-2rem))] lg:bottom-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const style = TONE_STYLES[toast.tone];
          return (
            <div
              key={toast.id}
              className={cn(
                'pointer-events-auto relative flex animate-toast-in items-start gap-3 overflow-hidden',
                'rounded-md border border-line bg-elevated p-4 pl-4 shadow-pop',
              )}
            >
              <span className={cn('absolute inset-y-0 left-0 w-1', style.bar)} aria-hidden="true" />
              <span className={cn('mt-0.5 shrink-0 text-base', style.iconColor)}>{style.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{toast.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded p-1 text-ink-faint transition-colors hover:bg-surface hover:text-ink"
                aria-label="Fechar aviso"
              >
                <IconClose className="text-sm" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast precisa estar dentro de <ToastProvider>.');
  return context;
}
