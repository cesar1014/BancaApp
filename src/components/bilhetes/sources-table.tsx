import { cn } from '@/lib/cn';
import type { SourceScore } from '@/lib/services/bilhetes.service';
import { Badge } from '@/components/ui/badge';
import { Percent, Result, ResultPercent } from '@/components/ui/money';
import { IconAlert, IconCheck, IconClose, IconInfo } from '@/components/icons';
import { formatOddMilli } from '@/components/tips/format';
import { formatDateTimeBR } from '@/lib/datetime';
import { SourceToggle } from './collect-button';

/**
 * Números que a linha exibe.
 *
 * Fonte de site publica bilhete e a stake é em reais; canal de Telegram
 * publica call e a stake é em unidades. As duas coisas convivem na mesma
 * tabela, e por isso o lucro é formatado de forma diferente em cada caso — um
 * canal aparecendo com "R$ 0,00" era um dos sintomas que motivaram isto.
 *
 * Sem números, tudo vira travessão. Melhor que zero, que se lê como derrota.
 */
interface Linha {
  resolvidos: number;
  greens: number;
  reds: number;
  winRateBps: number | null;
  avgOddMilli: number | null;
  roiBps: number | null;
  yieldBps: number | null;
  lucro: { tipo: 'reais'; cents: number } | { tipo: 'unidades'; centis: number };
  rotulo: string;
}

function linhaDe(source: SourceScore): Linha {
  if (source.calls) {
    const c = source.calls;
    return {
      resolvidos: c.settled,
      greens: c.greens,
      reds: c.reds,
      winRateBps: c.hitRateBps,
      avgOddMilli: c.averageOddMilli,
      roiBps: c.roiBps,
      // Para uma call de uma perna, yield e ROI são a mesma coisa.
      yieldBps: c.roiBps,
      lucro: { tipo: 'unidades', centis: c.profitCentis },
      rotulo: 'calls',
    };
  }
  const m = source.metrics;
  return {
    resolvidos: m.settled,
    greens: m.greens,
    reds: m.reds,
    winRateBps: m.winRateBps,
    avgOddMilli: m.avgOddMilli,
    roiBps: m.roiBps,
    yieldBps: m.yieldBps,
    lucro: { tipo: 'reais', cents: m.profitCents },
    rotulo: 'bilhetes',
  };
}

function Lucro({ valor }: { valor: Linha['lucro'] }) {
  if (valor.tipo === 'reais') return <Result cents={valor.cents} />;
  const u = valor.centis / 100;
  return (
    <span className={cn('tnum font-bold', u > 0 ? 'text-positive' : u < 0 ? 'text-negative' : 'text-ink-muted')}>
      {u > 0 ? '+' : ''}
      {u.toFixed(2)}u
    </span>
  );
}

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
                <p className="text-xs text-ink-faint">
                  {source.country === 'BR' ? 'Brasil' : 'Internacional'} · {linhaDe(source).resolvidos} de{' '}
                  {linhaDe(source).rotulo} resolvidos
                </p>
              </div>
              <ActiveBadge active={source.isActive} />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-3">
              <Cell label="Win rate" value={<Percent bps={linhaDe(source).winRateBps} fractionDigits={1} />} />
              <Cell label="ROI" value={<ResultPercent bps={linhaDe(source).roiBps} fractionDigits={1} />} strong />
              <Cell label="Yield" value={<ResultPercent bps={linhaDe(source).yieldBps} fractionDigits={1} />} strong />
              <Cell label="Green / Red" value={`${linhaDe(source).greens} / ${linhaDe(source).reds}`} />
              <Cell label="Odd média" value={linhaDe(source).avgOddMilli === null ? '—' : formatOddMilli(linhaDe(source).avgOddMilli!)} />
              <Cell label="Lucro" value={<Lucro valor={linhaDe(source).lucro} />} />
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
                <td className="px-3 py-3 text-right tnum text-ink-muted">{linhaDe(source).resolvidos}</td>
                <td className="px-3 py-3 text-right tnum text-positive">{linhaDe(source).greens}</td>
                <td className="px-3 py-3 text-right tnum text-negative">{linhaDe(source).reds}</td>
                <td className="px-3 py-3 text-right"><Percent bps={linhaDe(source).winRateBps} fractionDigits={1} /></td>
                <td className="px-3 py-3 text-right tnum text-ink-muted">{linhaDe(source).avgOddMilli === null ? '—' : formatOddMilli(linhaDe(source).avgOddMilli!)}</td>
                <td className="px-3 py-3 text-right text-[15px]"><ResultPercent bps={linhaDe(source).roiBps} fractionDigits={1} /></td>
                <td className="px-3 py-3 text-right text-[15px]"><ResultPercent bps={linhaDe(source).yieldBps} fractionDigits={1} /></td>
                <td className="px-3 py-3 text-right"><Lucro valor={linhaDe(source).lucro} /></td>
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
  const notas: string[] = [];
  if (source.smallSample && source.metrics.settled > 0) {
    notas.push(`Amostra pequena (${source.metrics.settled} resolvidos): com menos de 30, o ROI está dentro do ruído.`);
  }
  /**
   * Bilhete com perna que não pôde ser apurada fica de fora da conta. Dizer
   * quantos são não é detalhe: sem isso, uma fonte apareceria com dois
   * resultados quando publicou quarenta, e o número pareceria arbitrário.
   */
  if (source.excludedIncomplete > 0) {
    notas.push(
      `${source.excludedIncomplete} bilhete(s) ficaram fora da conta por terem perna que o sistema não conseguiu apurar — jogo fora das competições acompanhadas ou mercado não reconhecido.`,
    );
  }
  if (notas.length === 0) return null;
  return (
    <div className="mt-3 space-y-1">
      {notas.map((nota) => (
        <p key={nota} className="flex items-start gap-1.5 text-xs text-warning">
          <IconAlert /> {nota}
        </p>
      ))}
    </div>
  );
}

function RunNote({ source, timezone, inline }: { source: SourceScore; timezone: string; inline?: boolean }) {
  // Canal de Telegram publica call, não bilhete: a coleta dele não passa por
  // tip_source_runs, então "nunca coletada" seria falso.
  if (source.calls) {
    const c = source.calls;
    return (
      <span className={cn('inline-flex items-center gap-1 text-ink-muted', !inline && 'mt-2 text-xs')}>
        <IconInfo />
        {c.calls} call{c.calls === 1 ? '' : 's'} · {c.settled} resolvida{c.settled === 1 ? '' : 's'}
        {c.roiBps === null ? '' : ` · ROI ${c.roiBps > 0 ? '+' : ''}${(c.roiBps / 100).toFixed(1)}%`}
      </span>
    );
  }
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
