import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { EntryStatus } from '@/lib/domain/types';
import { ENTRY_STATUS_LABEL } from '@/lib/domain/types';
import type { DayStatus } from '@/lib/domain/goals';
import { DAY_STATUS_LABEL } from '@/lib/domain/goals';

export type Tone = 'neutral' | 'positive' | 'negative' | 'warning' | 'accent' | 'muted' | 'dashed';

/**
 * Badges de placar: caixa-alta, peso alto, tracking largo. Como o lucro e o
 * acento são a mesma cor lima, "em aberto" não pode ser lima — vira contorno
 * tracejado, que lê como "ainda não resolvido" e não como "ganhou".
 */
const TONES: Record<Tone, string> = {
  neutral: 'bg-elevated text-ink-muted border-line-strong',
  positive: 'bg-accent/16 text-accent border-accent/35',
  negative: 'bg-negative/15 text-negative border-negative/35',
  warning: 'bg-warning/14 text-warning border-warning/32',
  accent: 'bg-accent/16 text-accent border-accent/35',
  muted: 'bg-elevated text-ink-muted border-line-strong',
  dashed: 'bg-transparent text-ink border-dashed border-line-strong',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2.5 py-1',
        'text-badge font-extrabold uppercase',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const ENTRY_STATUS_TONE: Record<EntryStatus, Tone> = {
  OPEN: 'dashed',
  GREEN: 'positive',
  RED: 'negative',
  VOID: 'muted',
  CASHOUT: 'warning',
};

export function EntryStatusBadge({ status }: { status: EntryStatus }) {
  return <Badge tone={ENTRY_STATUS_TONE[status]}>{ENTRY_STATUS_LABEL[status]}</Badge>;
}

const DAY_STATUS_TONE: Record<DayStatus, Tone> = {
  GOAL_HIT: 'positive',
  ABOVE_GOAL: 'positive',
  BELOW_GOAL: 'warning',
  STOP_HIT: 'negative',
  NO_ACTIVITY: 'muted',
  FUTURE: 'dashed',
};

export function DayStatusBadge({ status }: { status: DayStatus }) {
  return <Badge tone={DAY_STATUS_TONE[status]}>{DAY_STATUS_LABEL[status]}</Badge>;
}
