import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext } from '@/lib/services/context';
import { listAllEntries } from '@/lib/repos/entries';
import {
  breakdownBy,
  computeMemberStats,
  oddBandKey,
  oddBandLabel,
  type BreakdownRow,
} from '@/lib/domain/stats';
import { resolvePeriod, first } from '@/lib/period';
import { PageHeader } from '@/components/layout/page-header';
import { MonthPicker } from '@/components/layout/month-picker';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Money, Percent, Result, ResultPercent } from '@/components/ui/money';
import { EmptyState, Notice } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { IconChart } from '@/components/icons';
import { formatMonthLabel, monthOfDate, monthRange } from '@/lib/datetime';
import Link from 'next/link';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Estatísticas' };
export const dynamic = 'force-dynamic';

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const params = await searchParams;
  const period = resolvePeriod(params, context.today);
  const current = monthOfDate(context.today);

  // ?escopo=total mostra o histórico inteiro; o padrão é o mês selecionado.
  const scope = first(params.escopo) === 'total' ? 'total' : 'mes';
  const range = monthRange(period.year, period.month);

  const entries = await listAllEntries(
    context.bankroll.id,
    scope === 'total' ? {} : { dateFrom: range.start, dateTo: range.end },
  );

  const stats = computeMemberStats(
    entries.map((entry) => ({
      occurredOn: entry.occurredOn,
      status: entry.status,
      stakeCents: entry.stakeCents,
      profitCents: entry.profitCents,
      memberId: entry.memberId,
      oddMilli: entry.oddMilli,
    })),
    context.members.map((member) => ({ id: member.id, displayName: member.displayName })),
  );

  const asLike = entries.map((entry) => ({
    occurredOn: entry.occurredOn,
    status: entry.status,
    stakeCents: entry.stakeCents,
    profitCents: entry.profitCents,
    oddMilli: entry.oddMilli,
    sport: entry.sport,
    market: entry.market,
  }));

  const bySport = breakdownBy(asLike, (entry) => entry.sport);
  const byMarket = breakdownBy(asLike, (entry) => entry.market).slice(0, 12);
  const byOdd = breakdownBy(asLike, (entry) => oddBandKey(entry.oddMilli), oddBandLabel);

  const scopeLabel = scope === 'total' ? 'todo o histórico' : formatMonthLabel(period.year, period.month);

  return (
    <>
      <PageHeader
        title="Estatísticas"
        description={`Desempenho por integrante e por tipo de entrada — ${scopeLabel}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-line bg-surface p-1">
              <Link
                href={`/estatisticas?ano=${period.year}&mes=${period.month}`}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  scope === 'mes' ? 'bg-elevated text-ink' : 'text-ink-muted hover:text-ink',
                )}
              >
                Mês
              </Link>
              <Link
                href="/estatisticas?escopo=total"
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  scope === 'total' ? 'bg-elevated text-ink' : 'text-ink-muted hover:text-ink',
                )}
              >
                Histórico
              </Link>
            </div>
            {scope === 'mes' ? (
              <MonthPicker
                year={period.year}
                month={period.month}
                maxYear={current.year}
                maxMonth={current.month}
              />
            ) : null}
          </div>
        }
      />

      <Notice tone="info" className="mb-5" title="Como ler este ranking">
        A ordenação é por resultado financeiro, não por taxa de acerto. Acertar muito com odds baixas
        pode dar prejuízo; acertar pouco com odds altas pode dar lucro. Use lucro e ROI como critério
        principal e a taxa de acerto apenas como contexto.
      </Notice>

      <Card>
        <CardHeader title="Ranking por integrante" description="Ordenado pelo lucro no período." />
        {entries.length === 0 ? (
          <EmptyState
            icon={<IconChart />}
            title="Sem entradas no período"
            description="Registre entradas para acompanhar o desempenho de cada integrante."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="table-head">
                  <th className="px-5 py-2.5 font-semibold">#</th>
                  <th className="px-3 py-2.5 font-semibold">Integrante</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Entradas</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Greens</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Reds</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Taxa de acerto</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Stake total</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Lucro</th>
                  <th className="px-5 py-2.5 text-right font-semibold">ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {stats.map((row, index) => (
                  <tr key={row.memberId} className="row-hover">
                    <td className="px-5 py-3 text-xs text-ink-faint">{index + 1}</td>
                    <td className="px-3 py-3">
                      <span className="text-ink">{row.displayName}</span>
                      {index === 0 && row.profitCents > 0 ? (
                        <Badge tone="positive" className="ml-2">
                          Melhor resultado
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-right tnum text-ink-muted">{row.count}</td>
                    <td className="px-3 py-3 text-right tnum text-positive">{row.greens}</td>
                    <td className="px-3 py-3 text-right tnum text-negative">{row.reds}</td>
                    <td className="px-3 py-3 text-right">
                      <Percent bps={row.hitRateBps} fractionDigits={1} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Money cents={row.totalStakeVolumeCents} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Result cents={row.profitCents} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <ResultPercent bps={row.roiBps} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <BreakdownCard title="Por esporte" rows={bySport} />
        <BreakdownCard title="Por faixa de odd" rows={byOdd} />
      </div>

      <Card className="mt-5">
        <CardHeader title="Por mercado" description="Os 12 mercados com maior resultado." />
        {byMarket.length === 0 ? (
          <EmptyState title="Sem dados no período" icon={<IconChart />} />
        ) : (
          <BreakdownTable rows={byMarket} />
        )}
      </Card>
    </>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  return (
    <Card>
      <CardHeader title={title} />
      {rows.length === 0 ? (
        <CardBody>
          <p className="text-sm text-ink-muted">Sem dados no período.</p>
        </CardBody>
      ) : (
        <BreakdownTable rows={rows} />
      )}
    </Card>
  );
}

function BreakdownTable({ rows }: { rows: BreakdownRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="table-head">
            <th className="px-5 py-2.5 font-semibold">Categoria</th>
            <th className="px-3 py-2.5 text-right font-semibold">Entradas</th>
            <th className="px-3 py-2.5 text-right font-semibold">Acerto</th>
            <th className="px-3 py-2.5 text-right font-semibold">Stake</th>
            <th className="px-3 py-2.5 text-right font-semibold">Lucro</th>
            <th className="px-5 py-2.5 text-right font-semibold">ROI</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.key} className="row-hover">
              <td className="max-w-[220px] truncate px-5 py-2.5 text-ink">{row.label}</td>
              <td className="px-3 py-2.5 text-right tnum text-ink-muted">{row.count}</td>
              <td className="px-3 py-2.5 text-right">
                <Percent bps={row.hitRateBps} fractionDigits={0} />
              </td>
              <td className="px-3 py-2.5 text-right">
                <Money cents={row.stakeCents} />
              </td>
              <td className="px-3 py-2.5 text-right">
                <Result cents={row.profitCents} />
              </td>
              <td className="px-5 py-2.5 text-right">
                <ResultPercent bps={row.roiBps} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
