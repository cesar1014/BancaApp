import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { FixtureView } from '@/lib/services/sports/tips.service';
import { Badge } from '@/components/ui/badge';
import { AnalysisStateBadge, LiveStateBadge, StaleBadge } from './badges';
import { ScoreMeter } from './score-meter';
import { describeMarket, formatKickoff, formatMinute, formatOddMilli, formatProbabilityBps, formatSignedBps } from './format';

/** Linha compacta de partida (Hoje / Próximos). */
export function FixtureRow({ view, timezone }: { view: FixtureView; timezone: string }) {
  const live = view.status === 'LIVE' || view.status === 'HALFTIME';
  const best = view.best;
  return (
    <li className="row-hover rounded-md border border-line bg-elevated/40 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-2xs font-extrabold uppercase text-ink-faint">
            {view.league.name} · {live ? formatMinute(view.status, view.minute) : view.status === 'FINISHED' ? 'Encerrada' : formatKickoff(view.startTime, timezone)}
          </p>
          <Link href={`/dicas/partida/${encodeURIComponent(view.id)}`} className="mt-0.5 block text-sm font-bold text-ink hover:text-accent">
            <span className="truncate">{view.homeName}</span>{' '}
            {live || view.status === 'FINISHED' ? (
              <span className="tnum text-accent">
                {view.score.home}–{view.score.away}
              </span>
            ) : (
              <span className="text-ink-faint">x</span>
            )}{' '}
            <span className="truncate">{view.awayName}</span>
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {live ? <LiveStateBadge state={view.liveState} /> : view.status === 'SCHEDULED' && view.analysisState !== 'OBSERVANDO' ? <AnalysisStateBadge state={view.analysisState} /> : null}
          {view.funnelTier === 'IGNORED' && !live ? <Badge tone="muted">Fora do funil</Badge> : null}
          <StaleBadge stale={view.stale} />
        </div>
      </div>

      {best ? (
        <div className={cn('mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center')}>
          <div className="min-w-0 text-xs text-ink-muted">
            <span className="font-bold text-ink">{describeMarket(best.market, best.selection, best.line)}</span>
            <span className="tnum"> · prob. {formatProbabilityBps(best.probabilityBps)} · odd {best.oddMilli === null ? '—' : formatOddMilli(best.oddMilli)}</span>
            {best.valueBps !== null ? (
              <span className={cn('tnum font-bold', best.valueBps > 0 ? 'text-positive' : 'text-negative')}> · value {formatSignedBps(best.valueBps)}</span>
            ) : null}
          </div>
          <ScoreMeter score={best.score} size="sm" className="w-full sm:w-44" />
        </div>
      ) : (
        <p className="mt-2 text-xs text-ink-faint">
          {view.status === 'SCHEDULED' ? 'Análise pré-jogo disponível quando houver odds.' : 'Sem mercado aplicável no momento.'}
        </p>
      )}
    </li>
  );
}
