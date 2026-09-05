import { cn } from '@/lib/cn';
import type { SourceScore } from '@/lib/services/bilhetes.service';
import { Badge } from '@/components/ui/badge';
import { Percent, Result, ResultPercent } from '@/components/ui/money';
import { IconAlert, IconCheck, IconClose, IconInfo } from '@/components/icons';
import { formatOddMilli } from '@/components/tips/format';
import { formatDateTimeBR } from '@/lib/datetime';
import { SourceToggle } from './collect-button';

/** O placar: ROI e yield com o mesmo destaque do win rate. */
export function SourcesTable({ sources, timezone, canManage }: { sources: SourceScore[]; timezone: string; canManage: boolean }) {
  return (
    <>
      {/* Celular: um cartão por fonte */}
      <ul className="space-y-3 lg:hidden">
        {sources.map((source) => (
          <li key={source.slug} className="rounded-lg border border-line bg-elevated/45 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-ink">{source.name}</p>
                <p className="text-xs text-ink-faint">{source.country === 'BR' ? 'Brasil' : 'Internacional'} · {source.metrics.settled} resolvidos</p>
              </div>
              <ActiveBadge active={source.isActive} />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-3">
              <Cell label="Win rate" value={<Percent bps={source.metrics.winRateBps} fractionDigits={1} />} />
              <Cell label="ROI" value={<ResultPercent bps={source.metrics.roiBps} fractionDigits={1} />} strong />
              <Cell label="Yield" value={<ResultPercent bps={source.metrics.yieldBps} fractionDigits={1} />} strong />
              <Cell label="Green / Red" value={`${source.metrics.greens} / ${source.metrics.reds}`} />
              <Cell label="Odd média" value={source.metrics.avgOddMilli === null ? '—' : formatOddMilli(source.metrics.avgOddMilli)} />
              <Cell label="Lucro" value={<Result cents={source.metrics.profitCents} />} />
            </dl>
            <SampleNote source={source} />
            <RunNote source={source} timezone={timezone} />
            {canManage ? <div className="mt-3 flex justify-end"><SourceToggle slug={source.slug} active={source.isActive} /></div> : null}
          </li>
        ))}
      </ul>

      {/* Desktop: tabela */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="table-head">
              <th className="px-5 py-3 font-extrabold">Fonte</th>
              <th className="px-3 py-3 text-right font-extrabold">Bilhetes</th>
              <th className="px-3 py-3 text-right font-extrabold">Green</th>
              <th className="px-3 py-3 text-right font-extrabold">Red</th>
              <th className="px-3 py-3 text-right font-extrabold">Win rate</th>
              <th className="px-3 py-3 text-right font-extrabold">Odd média</th>
              <th className="px-3 py-3 text-right font-extrabold text-ink">ROI</th>
              <th className="px-3 py-3 text-right font-extrabold text-ink">Yield</th>
              <th className="px-3 py-3 text-right font-extrabold">Lucro</th>
              <th className="px-3 py-3 font-extrabold">Última coleta</th>
              {canManage ? <th className="px-5 py-3 text-right font-extrabold">Estado</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sources.map((source) => (
              <tr key={source.slug} className={cn('row-hover', !source.isActive && 'opacity-60')}>
                <td className="px-5 py-3">
                  <p className="font-bold text-ink">{source.name}</p>
                  <p className="text-xs text-ink-faint">
                    {source.country === 'BR' ? 'Brasil' : 'Internacional'}
                    {source.smallSample && source.metrics.settled > 0 ? ' · amostra pequena' : ''}
                    {source.open > 0 ? ` · ${source.open} em aberto` : ''}
                    {source.pending > 0 ? ` · ${source.pending} p/ conferir` : ''}
                  </p>
                </td>
                <td className="px-3 py-3 text-right tnum text-ink-muted">{source.metrics.settled}</td>
                <td className="px-3 py-3 text-right tnum text-positive">{source.metrics.greens}</td>
                <td className="px-3 py-3 text-right tnum text-negative">{source.metrics.reds}</td>
                <td className="px-3 py-3 text-right"><Percent bps={source.metrics.winRateBps} fractionDigits={1} /></td>
                <td className="px-3 py-3 text-right tnum text-ink-muted">{source.metrics.avgOddMilli === null ? '—' : formatOddMilli(source.metrics.avgOddMilli)}</td>
                <td className="px-3 py-3 text-right text-[15px]"><ResultPercent bps={source.metrics.roiBps} fractionDigits={1} /></td>
                <td className="px-3 py-3 text-right text-[15px]"><ResultPercent bps={source.metrics.yieldBps} fractionDigits={1} /></td>
                <td className="px-3 py-3 text-right"><Result cents={source.metrics.profitCents} /></td>
                <td className="px-3 py-3 text-xs text-ink-muted"><RunNote source={source} timezone={timezone} inline /></td>
                {canManage ? (
                  <td className="px-5 py-3 text-right">
                    <span className="inline-flex items-center gap-2">
                      <ActiveBadge active={source.isActive} />
                      <SourceToggle slug={source.slug} active={source.isActive} />
                    </span>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Cell({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div>
      <dt className="lbl">{label}</dt>
      <dd className={cn('mt-0.5 tnum', strong ? 'text-[15px] font-extrabold' : 'text-sm font-bold text-ink')}>{value}</dd>
    </div>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return active ? <Badge tone="positive"><IconCheck />Ativa</Badge> : <Badge tone="muted"><IconClose />Desligada</Badge>;
}

function SampleNote({ source }: { source: SourceScore }) {
  if (!source.smallSample) return null;
  return (
    <p className="mt-3 flex items-center gap-1.5 text-xs text-warning">
      <IconAlert /> Amostra pequena ({source.metrics.settled} resolvidos): com menos de 30, o ROI está dentro do ruído.
    </p>
  );
}

function RunNote({ source, timezone, inline }: { source: SourceScore; timezone: string; inline?: boolean }) {
  const run = source.lastRun;
  if (!run) return <span className={cn('text-ink-faint', !inline && 'mt-2 block text-xs')}>nunca coletada</span>;
  const tone = run.status === 'ERROR' ? 'text-negative' : run.status === 'EMPTY' ? 'text-warning' : 'text-ink-muted';
  const label = run.status === 'ERROR' ? `falhou: ${run.error ?? 'erro'}` : run.status === 'EMPTY' ? 'sem dados' : `${run.found} bilhete(s), ${run.created} novo(s)`;
  return (
    <span className={cn('inline-flex items-center gap-1', tone, !inline && 'mt-2 text-xs')}>
      {run.status === 'ERROR' ? <IconAlert /> : run.status === 'EMPTY' ? <IconInfo /> : <IconCheck />}
      {formatDateTimeBR(run.at, timezone)} · {label}
    </span>
  );
}
