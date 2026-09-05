import { cn } from '@/lib/cn';
import type { ScoreBreakdown } from '@/lib/sports/domain/models';

/** Barra do score 0–100 (a mesma linguagem do medidor de risco). */
export function ScoreMeter({
  score,
  size = 'md',
  className,
}: {
  score: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, score));
  const tone = clamped >= 82 ? 'bg-positive' : clamped >= 70 ? 'bg-accent' : clamped >= 50 ? 'bg-warning' : 'bg-line-strong';
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className={cn('relative flex-1 overflow-hidden rounded-full bg-sunken ring-1 ring-inset ring-line', size === 'sm' ? 'h-1.5' : 'h-2.5')}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Score ${clamped} de 100`}
      >
        <div className={cn('h-full rounded-full transition-[width] duration-700 ease-placar', tone)} style={{ width: `${clamped}%` }} />
      </div>
      <span className={cn('shrink-0 tnum font-extrabold text-ink', size === 'sm' ? 'text-xs' : 'text-sm')}>
        {clamped}
        <span className="font-bold text-ink-faint">/100</span>
      </span>
    </div>
  );
}

/** Composição do score, componente a componente (pontos ponderados). */
export function ScoreBreakdownList({ breakdown }: { breakdown: ScoreBreakdown }) {
  const items = breakdown.items.filter((item) => item.max > 0 || !item.available);
  if (items.length === 0) return null;
  return (
    <dl className="grid gap-1.5 text-xs">
      {items.map((item) => (
        <div key={item.key} className="flex items-center justify-between gap-3">
          <dt className={cn('text-ink-muted', !item.available && 'italic text-ink-faint')}>
            {item.label}
            {!item.available ? ' (sem dado, peso redistribuído)' : ''}
          </dt>
          <dd className="tnum font-bold text-ink">
            {item.available ? `${Math.round(item.points)}/${Math.round(item.max)}` : '—'}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Barra dupla mandante × visitante (pressão ofensiva). */
export function PressureBars({ home, away }: { home: number | null; away: number | null }) {
  if (home === null && away === null) return null;
  const h = home ?? 0;
  const a = away ?? 0;
  const total = Math.max(1, h + a);
  return (
    <div>
      <div className="flex items-center justify-between text-2xs font-extrabold uppercase text-ink-faint">
        <span>Pressão ofensiva</span>
        <span className="tnum">
          {home ?? '—'} <span className="text-ink-faint">·</span> {away ?? '—'}
        </span>
      </div>
      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-sunken ring-1 ring-inset ring-line" aria-hidden="true">
        <div className="h-full bg-accent transition-[width] duration-700 ease-placar" style={{ width: `${(h / total) * 100}%` }} />
        <div className="h-full bg-warning/80 transition-[width] duration-700 ease-placar" style={{ width: `${(a / total) * 100}%` }} />
      </div>
    </div>
  );
}
