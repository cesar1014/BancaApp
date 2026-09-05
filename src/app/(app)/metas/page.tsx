import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext } from '@/lib/services/context';
import { buildDashboard } from '@/lib/services/dashboard';
import { resolvePeriod } from '@/lib/period';
import { PageHeader } from '@/components/layout/page-header';
import { MonthPicker } from '@/components/layout/month-picker';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { MiniStat, ProgressBar } from '@/components/ui/stat';
import { Money, Result } from '@/components/ui/money';
import { DayStatusBadge } from '@/components/ui/badge';
import { Notice } from '@/components/ui/feedback';
import { MonthlyGoalForm } from '@/components/goals/monthly-goal-form';
import { GoalCalendar } from '@/components/goals/goal-calendar';
import { GoalChart } from '@/components/charts/goal-chart';
import { formatDateBR, formatMonthLabel, monthOfDate } from '@/lib/datetime';
import { formatBps } from '@/lib/numbers';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Metas diárias' };
export const dynamic = 'force-dynamic';

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const params = await searchParams;
  const period = resolvePeriod(params, context.today);
  const data = await buildDashboard(context, period.year, period.month);
  const current = monthOfDate(context.today);

  const daysWithActivity = data.series.filter((row) => row.entriesCount > 0).length;
  const daysAboveGoal = data.series.filter((row) => row.status === 'GOAL_HIT').length;
  const daysWithStop = data.series.filter((row) => row.status === 'STOP_HIT').length;

  return (
    <>
      <PageHeader
        title="Metas diárias"
        description="A meta diária é apenas uma referência para acompanhar a meta mensal. Não há obrigação de lucro em nenhum dia."
        actions={
          <div className="flex items-center gap-2">
            {context.permissions.canManageGoals ? (
              <MonthlyGoalForm
                year={period.year}
                month={period.month}
                goalCents={data.goal.goalCents}
                activeDays={data.goal.activeDays}
                targetBankrollCents={data.goal.targetBankrollCents}
                isOverride={data.goal.isOverride}
              />
            ) : null}
            <MonthPicker
              year={period.year}
              month={period.month}
              maxYear={current.year}
              maxMonth={current.month}
            />
          </div>
        }
      />

      {data.goal.isOverride ? (
        <Notice tone="info" className="mb-5" title="Meta específica deste mês">
          {formatMonthLabel(period.year, period.month)} usa uma meta própria de{' '}
          {formatMoney(data.goal.goalCents)} em {data.goal.activeDays} dias ativos, diferente das
          configurações gerais.
        </Notice>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Meta do mês" value={<Money cents={data.goal.goalCents} />} />
        <MiniStat label="Meta diária" value={<Money cents={data.goal.dailyGoalCents} />} />
        <MiniStat
          label="Realizado no mês"
          value={<Result cents={data.monthSummary.profitCents} />}
        />
        <MiniStat
          label="Progresso"
          value={formatBps(data.goalProgress.progressBps, 1)}
          tone={data.goalProgress.isReached ? 'positive' : 'accent'}
        />
      </div>

      <Card className="mt-5">
        <CardBody>
          <ProgressBar
            valueBps={data.goalProgress.progressBarBps}
            tone={
              data.monthSummary.profitCents < 0
                ? 'negative'
                : data.goalProgress.isReached
                  ? 'positive'
                  : 'accent'
            }
            height="lg"
          />
          <div className="mt-2 flex justify-between text-2xs text-ink-faint">
            <span>R$ 0</span>
            <span>{formatMoney(data.goal.goalCents)}</span>
          </div>
          <div className="mt-5">
            <GoalChart
              points={data.series.map((row) => ({
                date: row.date,
                goalCents: row.cumulativeGoalCents,
                realizedCents: row.cumulativeProfitCents,
                isFuture: row.isFuture,
              }))}
            />
          </div>
        </CardBody>
      </Card>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <MiniStat label="Dias com entradas" value={daysWithActivity} />
        <MiniStat label="Dias com meta batida" value={daysAboveGoal} tone="positive" />
        <MiniStat
          label="Dias com stop atingido"
          value={daysWithStop}
          tone={daysWithStop > 0 ? 'negative' : 'default'}
        />
      </div>

      {/* Leitura de relance do mês inteiro — no celular substitui a tabela. */}
      <Card className="mt-5">
        <CardHeader
          title={`Calendário de ${formatMonthLabel(period.year, period.month)}`}
          description="Cada dia contra a meta diária. A barra é o resultado do dia medido contra a meta."
        />
        <CardBody>
          <GoalCalendar rows={data.series} />
        </CardBody>
      </Card>

      <Card className="mt-5 hidden lg:block">
        <CardHeader
          title={`Dia a dia de ${formatMonthLabel(period.year, period.month)}`}
          description="Meta acumulada, realizado acumulado, banca-alvo e banca real."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="table-head">
                <th className="px-5 py-2.5 font-semibold">Data</th>
                <th className="px-3 py-2.5 text-right font-semibold">Meta do dia</th>
                <th className="px-3 py-2.5 text-right font-semibold">Resultado</th>
                <th className="px-3 py-2.5 text-right font-semibold">Meta acumulada</th>
                <th className="px-3 py-2.5 text-right font-semibold">Acumulado</th>
                <th className="px-3 py-2.5 text-right font-semibold">Banca-alvo</th>
                <th className="px-3 py-2.5 text-right font-semibold">Banca real</th>
                <th className="px-3 py-2.5 text-right font-semibold">Diferença</th>
                <th className="px-5 py-2.5 text-center font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.series.map((row) => (
                <tr
                  key={row.date}
                  className={cn(
                    'row-hover',
                    row.isToday && 'bg-accent/6',
                    row.isFuture && 'opacity-45',
                  )}
                >
                  <td className="whitespace-nowrap px-5 py-2.5">
                    <span className="text-ink">{formatDateBR(row.date)}</span>
                    <span className="ml-2 text-xs text-ink-faint">{row.weekday}</span>
                    {row.isToday ? (
                      <span className="ml-2 text-2xs font-medium text-accent">hoje</span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tnum text-ink-muted">
                    {formatMoney(row.dailyGoalCents)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    {row.entriesCount === 0 ? (
                      <span className="text-ink-faint">—</span>
                    ) : (
                      <Result cents={row.dayProfitCents} />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tnum text-ink-muted">
                    {formatMoney(row.cumulativeGoalCents)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    {row.isFuture ? (
                      <span className="text-ink-faint">—</span>
                    ) : (
                      <Result cents={row.cumulativeProfitCents} />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tnum text-ink-muted">
                    {formatMoney(row.targetBankrollCents)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tnum text-ink">
                    {row.isFuture ? '—' : formatMoney(row.realBankrollCents)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    {row.isFuture ? (
                      <span className="text-ink-faint">—</span>
                    ) : (
                      <Result cents={row.differenceCents} />
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-center">
                    <DayStatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
