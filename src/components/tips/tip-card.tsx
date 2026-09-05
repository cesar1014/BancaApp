import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { TipWithFixture } from '@/lib/repos/tips';
import { Result } from '@/components/ui/money';
import { ConfidenceBadge, TipResultBadge } from './badges';
import { ScoreMeter } from './score-meter';
import { describeMarket, formatAgo, formatKickoffDate, formatMinute, formatOddMilli, formatProbabilityBps, formatSignedBps } from './format';

/** Cartão de dica (Destaques e Histórico). */
export function TipCard({ tip, timezone, now, className }: { tip: TipWithFixture; timezone: string; now: Date; className?: string }) {
  const live = tip.fixtureStatus === 'LIVE' || tip.fixtureStatus === 'HALFTIME';
  const settled = tip.status !== 'ACTIVE';
  return (
    <article className={cn('card flex flex-col', className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <p className="truncate text-2xs font-extrabold uppercase text-ink-faint">
            {tip.leagueName} · {formatKickoffDate(tip.startTime, timezone)}
          </p>
          <Link href={`/dicas/partida/${encodeURIComponent(tip.fixtureId)}`} className="mt-1 block truncate text-[15px] font-750 tracking-[-0.02em] text-ink hover:text-accent">
            {tip.homeName} <span className="text-ink-faint">x</span> {tip.awayName}
          </Link>
          <p className="mt-0.5 text-xs text-ink-muted">
            {live ? (
              <>
                <span className="font-bold text-accent">{formatMinute(tip.fixtureStatus, tip.fixtureMinute)}</span> · {tip.fixtureScore.home} x {tip.fixtureScore.away}
              </>
            ) : tip.fixtureStatus === 'FINISHED' ? (
              <>Final {tip.fixtureScore.home} x {tip.fixtureScore.away}</>
            ) : (
              'Pré-jogo'
            )}
          </p>
        </div>
        <TipResultBadge result={tip.result} status={tip.status} />
      </div>

      <div className="px-5 pt-4">
        <p className="text-[16px] font-extrabold tracking-[-0.02em] text-ink">{describeMarket(tip.market, tip.selection, tip.line)}</p>
        <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-6">
          <Metric label="Odd" value={formatOddMilli(tip.oddMilli)} strong />
          <Metric label="Odd mínima" value={formatOddMilli(tip.minOddMilli)} />
          <Metric label="Prob. estimada" value={formatProbabilityBps(tip.probabilityBps)} />
          <Metric label="Odd justa" value={formatOddMilli(tip.fairOddMilli)} />
          <Metric label="Value" value={formatSignedBps(tip.valueBps)} className={tip.valueBps > 0 ? 'text-positive' : 'text-negative'} strong />
          {settled ? (
            <div className="min-w-0">
              <dt className="lbl truncate">Resultado</dt>
              <dd className="mt-0.5 text-[15px]"><Result cents={tip.profitCents} /></dd>
            </div>
          ) : (
            <Metric label="EV" value={formatSignedBps(tip.evBps)} className={tip.evBps > 0 ? 'text-positive' : 'text-negative'} />
          )}
        </dl>
        <ScoreMeter score={tip.score} className="mt-3" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line px-5 py-3 text-xs text-ink-faint">
        <ConfidenceBadge confidence={tip.confidence} />
        {tip.minuteAt !== null ? <span>indicada aos {tip.minuteAt}&apos;</span> : <span>indicada no pré-jogo</span>}
        {tip.bookmaker ? <span>· {tip.bookmaker}</span> : null}
        <span>· {formatAgo(tip.createdAt, now)}</span>
      </div>

      {tip.rationale ? (
        <p className="border-t border-line bg-sunken/50 px-5 py-3 text-xs leading-relaxed text-ink-muted">{tip.rationale}</p>
      ) : null}
    </article>
  );
}

function Metric({ label, value, strong, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className="min-w-0">
      <dt className="lbl truncate">{label}</dt>
      <dd className={cn('mt-0.5 tnum', strong ? 'text-[15px] font-extrabold' : 'text-sm font-bold', className ?? 'text-ink')}>{value}</dd>
    </div>
  );
}
