'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { IconSpinner } from '@/components/icons';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg' | 'icon';

/**
 * O primário é o acento em superfície sólida com tinta escura em cima — a
 * mesma inversão do bloco herói. Todo o resto é discreto para não competir.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-ink-invert font-extrabold shadow-glow hover:bg-accent-deep hover:-translate-y-px active:translate-y-0',
  secondary: 'bg-elevated text-ink border border-line hover:border-line-strong hover:bg-line/50',
  ghost: 'text-ink-muted hover:bg-elevated hover:text-ink',
  danger: 'bg-negative/12 text-negative border border-negative/30 hover:bg-negative/20',
  subtle: 'bg-transparent text-accent hover:bg-accent/10',
};

/** Alvos de toque generosos: este produto é conferido no celular. */
const SIZES: Record<Size, string> = {
  sm: 'min-h-[40px] px-3.5 text-[13px] gap-1.5 rounded-full',
  md: 'min-h-[46px] px-[18px] text-sm gap-2 rounded-full',
  lg: 'min-h-[52px] px-6 text-[15px] gap-2 rounded-full',
  icon: 'h-[42px] w-[42px] text-base rounded-md',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', loading = false, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-bold tracking-[-0.01em]',
        'transition-all duration-150 ease-placar disabled:cursor-not-allowed disabled:opacity-50',
        'disabled:hover:translate-y-0',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <IconSpinner className="text-base" /> : null}
      {children}
    </button>
  );
});
