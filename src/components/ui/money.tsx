import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatMoney, formatMoneySigned, type Cents } from '@/lib/money';
import { formatBps, formatBpsSigned, type Bps } from '@/lib/numbers';

/** Valor monetário neutro (banca, meta, stake). */
export function Money({ cents, className }: { cents: Cents; className?: string }) {
  return <span className={cn('tnum', className)}>{formatMoney(cents)}</span>;
}

/**
 * Valor de resultado: verde para lucro, vermelho para prejuízo, neutro no zero.
 * É o único lugar da interface onde a cor carrega significado financeiro.
 */
export function Result({
  cents,
  className,
  showSign = true,
  zeroMuted = true,
}: {
  cents: Cents;
  className?: string;
  showSign?: boolean;
  zeroMuted?: boolean;
}) {
  return (
    <span
      className={cn(
        'tnum font-bold',
        cents > 0 && 'text-positive',
        cents < 0 && 'text-negative',
        cents === 0 && zeroMuted && 'text-ink-muted',
        className,
      )}
    >
      {showSign ? formatMoneySigned(cents) : formatMoney(cents)}
    </span>
  );
}

/** Percentual de resultado (ROI, variação). */
export function ResultPercent({
  bps,
  className,
  fractionDigits = 2,
}: {
  bps: Bps | null;
  className?: string;
  fractionDigits?: number;
}) {
  if (bps === null) return <span className={cn('tnum text-ink-faint', className)}>—</span>;
  return (
    <span
      className={cn(
        'tnum font-bold',
        bps > 0 && 'text-positive',
        bps < 0 && 'text-negative',
        bps === 0 && 'text-ink-muted',
        className,
      )}
    >
      {formatBpsSigned(bps, fractionDigits)}
    </span>
  );
}

/** Percentual neutro (participação, taxa de acerto). */
export function Percent({
  bps,
  className,
  fractionDigits = 2,
}: {
  bps: Bps | null;
  className?: string;
  fractionDigits?: number;
}) {
  if (bps === null) return <span className={cn('tnum text-ink-faint', className)}>—</span>;
  return <span className={cn('tnum', className)}>{formatBps(bps, fractionDigits)}</span>;
}

export function Dash({ children }: { children?: ReactNode }) {
  return <span className="text-ink-faint">{children ?? '—'}</span>;
}
