import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { IconAlert, IconInbox, IconInfo, IconShield } from '@/components/icons';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} aria-hidden="true" />;
}

export function SkeletonCard() {
  return (
    <div className="card p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-40" />
      <Skeleton className="mt-3 h-3 w-20" />
    </div>
  );
}

export function SkeletonTable({ rows = 6, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2 p-5">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-3">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <Skeleton
              key={columnIndex}
              className={cn('h-9 flex-1', columnIndex === 0 && 'max-w-[110px]')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-line bg-elevated text-2xl text-ink-faint">
        {icon ?? <IconInbox />}
      </div>
      <p className="text-base font-750 tracking-[-0.02em] text-ink">{title}</p>
      {description ? (
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

type NoticeTone = 'info' | 'warning' | 'danger' | 'success';

/**
 * O texto do aviso fica em tinta cheia — só o ícone e a borda carregam a cor.
 * Um aviso de limite precisa ser lido, não decorado.
 */
const NOTICE_STYLES: Record<NoticeTone, { wrapper: string; icon: string; node: ReactNode }> = {
  info: {
    wrapper: 'border-line bg-elevated/60',
    icon: 'text-ink-faint',
    node: <IconInfo />,
  },
  warning: {
    wrapper: 'border-warning/32 bg-warning/[0.09]',
    icon: 'text-warning',
    node: <IconAlert />,
  },
  danger: {
    wrapper: 'border-negative/35 bg-negative/10',
    icon: 'text-negative',
    node: <IconShield />,
  },
  success: {
    wrapper: 'border-accent/32 bg-accent/[0.09]',
    icon: 'text-accent',
    node: <IconInfo />,
  },
};

export function Notice({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const style = NOTICE_STYLES[tone];
  return (
    <div
      className={cn(
        'flex gap-3 rounded-md border p-4 text-[13px] leading-relaxed text-ink',
        style.wrapper,
        className,
      )}
    >
      <span className={cn('mt-px shrink-0 text-lg', style.icon)}>{style.node}</span>
      <div className="min-w-0">
        {title ? <p className="mb-1 font-750 tracking-[-0.01em]">{title}</p> : null}
        {children ? <div className="text-ink-muted">{children}</div> : null}
      </div>
    </div>
  );
}
