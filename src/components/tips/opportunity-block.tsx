import { cn } from '@/lib/cn';
import type { TipCandidate } from '@/lib/sports/domain/evaluate';
import { IconFlame } from '@/components/icons';
import { AnalysisStateBadge, ConfidenceBadge } from './badges';
import { ScoreBreakdownList, ScoreMeter } from './score-meter';
import { describeMarket, formatAgo, formatOddMilli, formatProbabilityBps, formatSignedBps } from './format';

/**
 * Bloco de oportunidade: mercado sugerido, probabilidade estimada, odd justa,
 * odd atual, value, score e estado. É o mesmo bloco nos Destaques, no Ao vivo
 * e no detalhe — só muda a densidade.
 */
export function OpportunityBlock({
  candidate,
  now,
  compact = false,
  showBreakdown = false,
  className,
}: {
  candidate: TipCandidate;
  now: Date;
  compact?: boolean;
  showBreakdown?: boolean;
  className?: string;
}) {
  const identified = candidate.state === 'ENTRADA_IDENTIFICADA' || candidate.state === 'VALUE_CONFIRMADO';
  const valueTone =
    candidate.valueBps === null ? 'text-ink-faint' : candidate.valueBps > 0 ? 'text-positive' : 'text-negative';

  return (
    <div
      className={cn(
        'rounded-md border p-4',
        identified ? 'border-accent/40 bg-accent-soft/60' : 'border-line bg-elevated/55',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-2xs font-extrabold uppercase text-ink-faint">
            {identified ? <IconFlame className="text-accent" /> : null}
            {identified ? 'Oportunidade identificada' : 'Mercado em análise'}
          </p>
          <p className="mt-1 text-[15px] font-750 tracking-[-0.02em] text-ink">
            {describeMarket(candidate.market, candidate.selection, candidate.line)}
          </p>
        </div>
        <AnalysisStateBadge state={candidate.state} />
      </div>

      <dl className={cn('mt-3 grid gap-x-4 gap-y-2', compact ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-6')}>
        <Metric label="Prob. estimada" value={formatProbabilityBps(candidate.probabilityBps)} />
        <Metric label="Odd justa" value={formatOddMilli(candidate.fairOddMilli)} />
        <Metric label="Odd atual" value={candidate.oddMilli === null ? '—' : formatOddMilli(candidate.oddMilli)} strong />
        <Metric label="Odd mínima" value={formatOddMilli(candidate.minOddMilli)} />
        <Metric label="Value" value={candidate.valueBps === null ? '—' : formatSignedBps(candidate.valueBps)} className={valueTone} strong />
        <Metric label="EV" value={candidate.evBps === null ? '—' : formatSignedBps(candidate.evBps)} className={valueTone} />
      </dl>

      <ScoreMeter score={candidate.score} className="mt-3" size={compact ? 'sm' : 'md'} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ConfidenceBadge confidence={candidate.confidence} />
        {candidate.bookmaker ? (
          <span className="text-xs text-ink-faint">
            {candidate.bookmaker} · odd vista {formatAgo(candidate.oddsCapturedAt, now)}
            {candidate.oddStale ? ' · pode estar desatualizada' : ''}
          </span>
        ) : (
          <span className="text-xs text-ink-faint">sem cotação disponível para este mercado</span>
        )}
      </div>

      {!compact && candidate.rationale.length > 0 ? (
        <ul className="mt-3 space-y-0.5 text-xs leading-relaxed text-ink-muted">
          {candidate.rationale.map((line, index) => (
            <li key={index}>· {line}</li>
          ))}
        </ul>
      ) : null}

      {showBreakdown ? (
        <div className="mt-3 border-t border-line pt-3">
          <p className="lbl mb-2">Composição do score</p>
          <ScoreBreakdownList breakdown={candidate.breakdown} />
        </div>
      ) : null}
    </div>
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
