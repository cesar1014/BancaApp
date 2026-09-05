'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
  required,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | string[] | undefined;
  children: ReactNode;
  className?: string;
  required?: boolean;
}) {
  const message = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={htmlFor} className="field-label">
        {label}
        {required ? <span className="ml-0.5 text-negative">*</span> : null}
      </label>
      {children}
      {message ? (
        <p className="mt-1 text-xs text-negative">{message}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn('input-base', invalid && 'border-negative/60 focus:border-negative', className)}
        {...props}
      />
    );
  },
);

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'input-base appearance-none pr-9',
          invalid && 'border-negative/60 focus:border-negative',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9.5 6 6 6-6" />
      </svg>
    </div>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'input-base min-h-[76px] resize-y',
        invalid && 'border-negative/60 focus:border-negative',
        className,
      )}
      {...props}
    />
  );
});

/**
 * Checkbox com input escondido de valor "false" imediatamente antes: garante
 * que o formulário sempre envie um valor explícito, marcado ou não.
 */
export function Checkbox({
  name,
  label,
  description,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: ReactNode;
  description?: ReactNode;
  defaultChecked?: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-elevated/50 p-3',
        'transition-colors hover:border-line-strong',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input type="hidden" name={name} value="false" />
      <input
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[rgb(var(--c-accent))]"
      />
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-ink-muted">{description}</span> : null}
      </span>
    </label>
  );
}
