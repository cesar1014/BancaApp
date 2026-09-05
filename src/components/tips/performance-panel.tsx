import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card';
import { MiniStat } from '@/components/ui/stat';
import { Money, Percent, Result, ResultPercent } from '@/components/ui/money';
import { MARKET_LABEL, type MarketKey } from '@/lib/sports/domain/models';
import type { PerformanceBreakdown, PerformanceMetrics } from '@/lib/sports/domain/performance';
import { formatOddMilli, formatSignedBps } from './format';

/** Métricas de performance das dicas. Rentabilidade antes de assertividade. */
export function PerformancePanel({ breakdown, leagueNames }: { breakdown: PerformanceBreakdown; leagueNames: Record<string, string> }) {
  const m = breakdown.overall;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Performance das dicas" description="Stake de referência fixa por dica. Lucro, ROI e yield vêm antes da taxa de acerto: acertar muito em odd baixa não paga." />
        <CardBody className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MiniStat label="Entradas" value={m.total} />
          <MiniStat label="Green" value={m.greens} tone="positive" />
          <MiniStat label="Red" value={m.reds} tone="negative" />
          <MiniStat label="Push" value={m.pushes} />
          <MiniStat label="Em aberto" value={m.pending} tone="warning" />
          <MiniStat label="Taxa de acerto" value={<Percent bps={m.winRateBps} fractionDigits={1} />} />
          <MiniStat label="Lucro" value={<Result cents={m.profitCents} />} />
          <MiniStat label="Prejuízo bruto" value={<Money cents={m.grossLossCents} />} tone={m.grossLossCents > 0 ? 'negative' : 'default'} />
          <MiniStat label="ROI" value={<ResultPercent bps={m.roiBps} />} />
          <MiniStat label="Yield" value={<ResultPercent bps={m.yieldBps} />} />
          <MiniStat label="Profit factor" value={m.profitFactorMilli === null ? '—' : (m.profitFactorMilli / 1000).toFixed(2).replace('.', ',')} />
          <MiniStat label="Odd média" value={m.avgOddMilli === null ? '—' : formatOddMilli(m.avgOddMilli)} />
        </CardBody>
        <CardFooter>
          EV médio das dicas: {m.avgEvBps === null ? '—' : formatSignedBps(m.avgEvBps)}. Yield = lucro ÷ volume arriscado; ROI = lucro ÷ stake de referência × entradas resolvidas.
        </CardFooter>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownTable title="Por mercado" rows={breakdown.byMarket} labelOf={(key) => MARKET_LABEL[key as MarketKey] ?? key} />
        <BreakdownTable title="Por campeonato" rows={breakdown.byLeague} labelOf={(key) => leagueNames[key] ?? key} />
        <BreakdownTable title="Por faixa de score" rows={breakdown.byScoreBand} labelOf={(key) => key} order={['90-100', '80-89', '70-79', '<70']} />
        <BreakdownTable title="Por faixa de odd" rows={breakdown.byOddsBand} labelOf={(key) => key} order={['1,20–1,49', '1,50–1,79', '1,80–2,19', '2,20–2,99', '3,00+']} />
      </div>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
  labelOf,
  order,
}: {
  title: string;
  rows: Record<string, PerformanceMetrics>;
  labelOf: (key: string) => string;
  order?: string[];
}) {
  const keys = order ? order.filter((key) => rows[key]) : Object.keys(rows).sort((a, b) => (rows[b]?.profitCents ?? 0) - (rows[a]?.profitCents ?? 0));
  return (
    <Card>
      <CardHeader title={title} />
      {keys.length === 0 ? (
        <CardBody>
          <p className="text-xs text-ink-faint">Sem dicas resolvidas neste recorte.</p>
        </CardBody>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="table-head">
                <th className="px-5 py-2.5 font-extrabold">Recorte</th>
                <th className="px-3 py-2.5 text-right font-extrabold">N</th>
                <th className="px-3 py-2.5 text-right font-extrabold">G/R</th>
                <th className="px-3 py-2.5 text-right font-extrabold">Acerto</th>
                <th className="px-3 py-2.5 text-right font-extrabold">Yield</th>
                <th className="px-5 py-2.5 text-right font-extrabold">Lucro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {keys.map((key) => {
                const row = rows[key]!;
                return (
                  <tr key={key} className="row-hover">
                    <td className="px-5 py-2.5 font-semibold text-ink">{labelOf(key)}</td>
                    <td className="px-3 py-2.5 text-right tnum text-ink-muted">{row.settled}</td>
                    <td className="px-3 py-2.5 text-right tnum text-ink-muted">
                      {row.greens}/{row.reds}
                    </td>
                    <td className="px-3 py-2.5 text-right"><Percent bps={row.winRateBps} fractionDigits={0} /></td>
                    <td className="px-3 py-2.5 text-right"><ResultPercent bps={row.yieldBps} fractionDigits={1} /></td>
                    <td className="px-5 py-2.5 text-right"><Result cents={row.profitCents} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
