import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { SlipView } from '@/lib/services/bilhetes.service';
import type { SlipLeg } from '@/lib/bilhetes/domain/types';
import { Badge, type Tone } from '@/components/ui/badge';
import { Result } from '@/components/ui/money';
import { IconAlert, IconCheck, IconClose, IconInfo, IconSearch } from '@/components/icons';
import { formatKickoff, formatOddMilli, formatSignedBps } from '@/components/tips/format';
import { formatDateBR } from '@/lib/datetime';
import { LegResolveButtons } from './leg-resolve';

/**
 * Cartão do bilhete. Ordem de leitura: título e fonte → odd informada × odd
 * real → margem → pernas → crédito. Todo estado tem ícone + palavra.
 */
export function SlipCard({ slip, timezone, canManage, showDate = false }: { slip: SlipView; timezone: string; canManage: boolean; showDate?: boolean }) {
  const diff = slip.comparison.differenceBps;
  const unverified = slip.legs.length - slip.verifiedLegs;

  return (
    <article className="card">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h3 className="text-[15px] font-750 uppercase tracking-[0.02em] text-ink">{slip.title}</h3>
          <p className="mt-1 text-xs text-ink-muted">
            publicado por <span className="font-bold text-ink">{slip.sourceName}</span>
            {' · '}
            {showDate ? formatDateBR(slip.referenceDate) : 'para os jogos do dia'} · {slip.legs.length} perna{slip.legs.length === 1 ? '' : 's'}
          </p>
        </div>
        <SlipStatusBadge slip={slip} />
      </header>

      <div className="grid gap-x-6 gap-y-3 px-5 pt-4 sm:grid-cols-3">
        <div>
          <p className="lbl">Odd informada</p>
          <p className="mt-1 text-num-lg font-extrabold tnum text-ink">{slip.informedOddMilli === null ? '—' : formatOddMilli(slip.informedOddMilli)}</p>
          <p className="text-2xs text-ink-faint">segundo a fonte</p>
        </div>
        <div>
          <p className="lbl">Odd real</p>
          {slip.comparison.realOddMilli !== null ? (
            <>
              <p className={cn('mt-1 text-num-lg font-extrabold tnum', diff === null ? 'text-ink' : diff < 0 ? 'text-negative' : 'text-positive')}>
                {formatOddMilli(slip.comparison.realOddMilli)}
                {diff !== null ? <span className="ml-2 text-sm font-bold">({formatSignedBps(diff)})</span> : null}
              </p>
              <p className="text-2xs text-ink-faint">melhor cotação disponível por perna</p>
            </>
          ) : (
            <>
              <p className="mt-1 text-num-lg font-extrabold tnum text-ink-faint">—</p>
              <p className="text-2xs text-ink-faint">{slip.verifiedLegs > 0 ? `conferência parcial (${unverified} perna${unverified === 1 ? '' : 's'} sem odd real)` : 'não foi possível conferir'}</p>
            </>
          )}
        </div>
        <div>
          <p className="lbl">Margem embutida</p>
          <p className={cn('mt-1 text-num-lg font-extrabold tnum', slip.marginBps === null ? 'text-ink-faint' : slip.marginBps >= 2_000 ? 'text-negative' : slip.marginBps >= 1_000 ? 'text-warning' : 'text-ink')}>
            {slip.marginBps === null ? '—' : `${(slip.marginBps / 100).toFixed(1).replace('.', ',')}%`}
          </p>
          <p className="text-2xs text-ink-faint">
            {slip.marginBps === null ? 'sem livro completo para calcular' : slip.marginKnownLegs < slip.legs.length ? `estimada com ${slip.marginKnownLegs} de ${slip.legs.length} pernas` : 'acumulada nas pernas'}
          </p>
        </div>
      </div>

      {slip.status === 'SETTLED' ? (
        <div className="mx-5 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-elevated/50 px-3.5 py-2.5 text-sm">
          <span className="text-ink-muted">
            Resultado com stake de referência
            {slip.effectiveOddMilli !== null && slip.effectiveOddMilli !== slip.informedOddMilli ? ` · odd efetiva ${formatOddMilli(slip.effectiveOddMilli)}` : ''}
          </span>
          <Result cents={slip.profitCents} className="text-[15px]" />
        </div>
      ) : null}

      {/* Pernas: recolhíveis no celular, sempre abertas no desktop */}
      <details className="group mt-4 border-t border-line sm:open" open>
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-2xs font-extrabold uppercase text-ink-faint sm:hidden">
          <span>Pernas ({slip.legs.length})</span>
          <span className="transition-transform group-open:rotate-180">▾</span>
        </summary>
        <ul className="divide-y divide-line">
          {slip.legs.map((leg, index) => (
            <LegRow key={leg.id} leg={leg} last={index === slip.legs.length - 1} timezone={timezone} canManage={canManage && slip.status === 'PENDING'} />
          ))}
        </ul>
      </details>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-sunken/50 px-5 py-3 text-xs text-ink-faint">
        <span>
          Fonte: <span className="text-ink-muted">{new URL(slip.sourceUrl).host.replace(/^www\./, '')}</span>
        </span>
        <a href={slip.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="font-bold text-ink-muted underline-offset-2 hover:text-accent hover:underline">
          ver original ↗
        </a>
      </footer>
    </article>
  );
}

function LegRow({ leg, last, timezone, canManage }: { leg: SlipLeg; last: boolean; timezone: string; canManage: boolean }) {
  const compared = leg.realOddMilli !== null;
  const legDiff = compared && leg.oddMilli !== null ? Math.round(((leg.realOddMilli! - leg.oddMilli) * 10_000) / leg.oddMilli) : null;
  return (
    <li className="flex gap-3 px-5 py-3">
      <span className="mt-1 w-3 shrink-0 text-center font-mono text-xs text-ink-faint" aria-hidden="true">
        {last ? '└' : '├'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink">
              {leg.homeName} <span className="text-ink-faint">×</span> {leg.awayName}
            </p>
            <p className="text-xs text-ink-muted">
              {leg.league ? `${leg.league} · ` : ''}
              {leg.kickoff ? formatKickoff(leg.kickoff, timezone) : 'horário não informado'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-ink">{leg.label}</p>
            <p className="text-xs tnum text-ink-muted">{leg.oddMilli === null ? 'odd não publicada' : `odd informada ${formatOddMilli(leg.oddMilli)}`}</p>
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          {compared ? (
            <span className={cn('inline-flex items-center gap-1 font-bold', legDiff === null ? 'text-ink' : legDiff < 0 ? 'text-negative' : 'text-positive')}>
              <IconCheck /> melhor: {formatOddMilli(leg.realOddMilli!)} {leg.realBookmaker}
              {legDiff !== null ? ` (${formatSignedBps(legDiff)})` : ''}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-ink-faint">
              <IconInfo /> {leg.fixtureId ? (leg.marketKey ? 'sem cotação para este mercado' : 'mercado sem cotação comparável') : 'não foi possível conferir'}
            </span>
          )}
          <LegResultBadge leg={leg} />
          {canManage && leg.result === null ? <LegResolveButtons legId={leg.id} /> : null}
        </div>
      </div>
    </li>
  );
}

function LegResultBadge({ leg }: { leg: SlipLeg }) {
  if (leg.result === 'GREEN') return <Badge tone="positive"><IconCheck />Green</Badge>;
  if (leg.result === 'RED') return <Badge tone="negative"><IconClose />Red</Badge>;
  if (leg.result === 'PUSH') return <Badge tone="muted">Push</Badge>;
  return null;
}

const STATUS: Record<string, { tone: Tone; label: string; icon: React.ReactNode }> = {
  OPEN: { tone: 'dashed', label: 'Em aberto', icon: <IconSearch /> },
  PENDING: { tone: 'warning', label: 'Conferência manual', icon: <IconAlert /> },
  VOID: { tone: 'muted', label: 'Anulado', icon: null },
};

export function SlipStatusBadge({ slip }: { slip: Pick<SlipView, 'status' | 'result'> }) {
  if (slip.status === 'SETTLED') {
    if (slip.result === 'GREEN') return <Badge tone="positive"><IconCheck />Green</Badge>;
    if (slip.result === 'RED') return <Badge tone="negative"><IconClose />Red</Badge>;
    return <Badge tone="muted">Push</Badge>;
  }
  const s = STATUS[slip.status] ?? STATUS.OPEN!;
  return (
    <Badge tone={s.tone}>
      {s.icon}
      {s.label}
    </Badge>
  );
}

export function SlipListEmpty({ reason }: { reason: string }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <p className="text-base font-750 text-ink">Nenhum bilhete para mostrar</p>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-ink-muted">{reason}</p>
      <Link href="/bilhetes/fontes" className="mt-5 text-xs font-bold text-accent underline-offset-2 hover:underline">
        Ver estado das fontes
      </Link>
    </div>
  );
}
