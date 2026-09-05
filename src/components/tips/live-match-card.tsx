import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { FixtureView } from '@/lib/services/sports/tips.service';
import { LiveStateBadge, StaleBadge } from './badges';
import { OpportunityBlock } from './opportunity-block';
import { PressureBars } from './score-meter';
import { formatAgo, formatMinute } from './format';

/**
 * Cartão da partida ao vivo. A hierarquia é: placar e minuto → estado →
 * oportunidade (quando existe) → estatísticas (recolhíveis no celular).
 */
export function LiveMatchCard({ view, now }: { view: FixtureView; now: Date }) {
  const highlight = view.liveState === 'OPORTUNIDADE';
  const attention = view.liveState === 'QUASE_ENTRADA' || view.liveState === 'ATENCAO';
  return (
    <article
      className={cn(
        'card',
        highlight && 'border-accent/50 shadow-glow',
        attention && 'border-warning/40',
      )}
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <p className="truncate text-2xs font-extrabold uppercase text-ink-faint">{view.league.name}</p>
          <Link href={`/dicas/partida/${encodeURIComponent(view.id)}`} className="mt-1 block hover:text-accent">
            <span className="text-[17px] font-extrabold tracking-[-0.02em] text-ink">{view.homeName}</span>
            <span className="mx-2 tnum text-[22px] font-extrabold text-accent">
              {view.score.home} <span className="text-ink-faint">x</span> {view.score.away}
            </span>
            <span className="text-[17px] font-extrabold tracking-[-0.02em] text-ink">{view.awayName}</span>
          </Link>
          <p className="mt-1 text-xs text-ink-muted">
            <span className="font-extrabold text-ink">{formatMinute(view.status, view.minute)}</span>
            <span className="text-ink-faint"> · atualizado {formatAgo(view.lastUpdated, now)}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <LiveStateBadge state={view.liveState} />
          <StaleBadge stale={view.stale} />
        </div>
      </div>

      <div className="space-y-4 px-5 pb-5 pt-4">
        {view.pressure.home !== null || view.pressure.away !== null ? (
          <PressureBars home={view.pressure.home} away={view.pressure.away} />
        ) : null}

        {view.best ? (
          <OpportunityBlock candidate={view.best} now={now} compact={!highlight} />
        ) : (
          <p className="text-xs text-ink-faint">
            {view.funnelTier === 'IGNORED' || view.funnelTier === 'INTERESTING'
              ? 'Fora do grupo monitorado neste ciclo — prioridade para partidas mais promissoras.'
              : 'Sem mercado aplicável neste momento.'}
          </p>
        )}

        {view.stats.length > 0 ? (
          <details className="group" open={highlight}>
            <summary className="flex cursor-pointer list-none items-center justify-between text-2xs font-extrabold uppercase text-ink-faint">
              <span>Estatísticas</span>
              <span className="text-ink-faint transition-transform group-open:rotate-180">▾</span>
            </summary>
            <table className="mt-2 w-full text-sm">
              <tbody className="divide-y divide-line">
                {view.stats.map((line) => (
                  <tr key={line.label}>
                    <td className="py-1.5 text-right tnum font-bold text-ink">{line.home}</td>
                    <td className="px-3 py-1.5 text-center text-xs text-ink-faint">{line.label}</td>
                    <td className="py-1.5 text-left tnum font-bold text-ink">{line.away}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ) : (
          <p className="text-xs text-ink-faint">Estatísticas não disponíveis para esta partida.</p>
        )}
      </div>
    </article>
  );
}
