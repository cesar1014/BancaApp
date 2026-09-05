import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext } from '@/lib/services/context';
import { buildDashboard } from '@/lib/services/dashboard';
import { resolvePeriod } from '@/lib/period';
import { PageHeader } from '@/components/layout/page-header';
import { MonthPicker } from '@/components/layout/month-picker';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card';
import { Gauge, GoalRing, HeroChip, HeroStat, MiniStat, ProgressBar, Stat } from '@/components/ui/stat';
import { Money, Percent, Result, ResultPercent } from '@/components/ui/money';
import { Badge, EntryStatusBadge } from '@/components/ui/badge';
import { EmptyState, Notice } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { GoalChart } from '@/components/charts/goal-chart';
import {
  IconAlert,
  IconChart,
  IconEntries,
  IconTarget,
  IconTransfer,
  IconWallet,
} from '@/components/icons';
import { formatMoney, formatMoneySigned } from '@/lib/money';
import { formatBps } from '@/lib/numbers';
import { formatDateBR, formatMonthLabel, monthOfDate } from '@/lib/datetime';
import { STOP_SCOPE_LABEL } from '@/lib/domain/risk';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage({
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
  const summary = data.monthSummary;
  const progress = data.goalProgress;

  const hitStops = data.stops.filter((stop) => stop.isHit);
  const nearStops = data.stops.filter((stop) => stop.isNear);

  const bankrollDeltaCents = data.currentBankrollCents - data.initialBankrollCents;
  const inProfit = summary.profitCents >= 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Acompanhamento de ${formatMonthLabel(period.year, period.month)}. A meta é uma referência de gestão — nenhum resultado é garantido.`}
        actions={
          <MonthPicker
            year={period.year}
            month={period.month}
            maxYear={current.year}
            maxMonth={current.month}
          />
        }
      />

      {hitStops.length > 0 ? (
        <Notice tone="danger" title="Limite de perda atingido" className="mb-4">
          <ul className="space-y-1">
            {hitStops.map((stop) => (
              <li key={stop.scope}>{stop.message}</li>
            ))}
          </ul>
          <p className="mt-2">
            Os limites não são ajustados automaticamente e o sistema não sugere aumentar stake para
            recuperar prejuízo.
          </p>
        </Notice>
      ) : null}

      {hitStops.length === 0 && nearStops.length > 0 ? (
        <Notice tone="warning" title="Atenção ao limite de perda" className="mb-4">
          <ul className="space-y-1">
            {nearStops.map((stop) => (
              <li key={stop.scope}>{stop.message}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {!data.partners.isShareValid ? (
        <Notice tone="warning" title="Participações não somam 100%" className="mb-4">
          A soma atual é {formatBps(data.partners.totalShareBps)}. Ajuste em{' '}
          <Link href="/socios" className="font-bold text-accent underline underline-offset-2">
            Sócios
          </Link>{' '}
          para que o rateio do lucro fique correto.
        </Notice>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Herói: a resposta a "como estamos?" antes de qualquer rolagem     */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid gap-4 xl:grid-cols-12">
        <HeroStat
          className="xl:col-span-7"
          isPositive={inProfit}
          label={`Lucro de ${formatMonthLabel(period.year, period.month)}`}
          value={formatMoneySigned(summary.profitCents)}
          chip={
            <HeroChip isPositive={inProfit}>
              {progress.isReached
                ? 'Meta do mês atingida'
                : `Faltam ${formatMoney(progress.remainingCents)} para a meta`}
            </HeroChip>
          }
          ring={
            <GoalRing
              valueBps={progress.progressBarBps}
              caption="da meta"
              on={inProfit ? 'accent' : 'surface'}
            />
          }
          meta={[
            { label: 'Banca atual', value: formatMoney(data.currentBankrollCents) },
            { label: 'ROI do mês', value: summary.roiBps === null ? '—' : formatBps(summary.roiBps) },
            { label: 'Meta do mês', value: formatMoney(progress.goalCents) },
            { label: 'Resolvidas', value: `${summary.settledCount} de ${summary.count}` },
          ]}
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:col-span-5 xl:grid-cols-1 xl:content-start">
          <Stat
            label="Banca atual"
            value={formatMoney(data.currentBankrollCents)}
            size="lg"
            icon={<IconWallet />}
            hint={
              <span className="flex flex-wrap items-center gap-1.5">
                <Result cents={bankrollDeltaCents} className="text-xs" />
                <span className="text-ink-faint">desde a banca inicial</span>
              </span>
            }
          />
          <Stat
            label="ROI do mês"
            value={summary.roiBps === null ? '—' : formatBps(summary.roiBps)}
            size="lg"
            tone={
              summary.roiBps === null
                ? 'default'
                : summary.roiBps > 0
                  ? 'positive'
                  : summary.roiBps < 0
                    ? 'negative'
                    : 'default'
            }
            icon={<IconChart />}
            hint={`Sobre ${formatMoney(summary.totalStakedCents)} apostados`}
          />
          <Stat
            label="Banca-alvo"
            value={formatMoney(data.targetBankrollCents)}
            size="lg"
            icon={<IconTarget />}
            hint={
              data.toTargetCents <= 0
                ? 'Alvo atingido'
                : `Faltam ${formatMoney(data.toTargetCents)}`
            }
          />
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Progresso da meta                                                 */}
      {/* ---------------------------------------------------------------- */}
      <Card className="mt-4">
        <CardBody>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="lbl">Progresso da meta mensal</p>
              <p className="mt-2 text-num-xl font-extrabold tnum text-ink">
                <Result cents={summary.profitCents} showSign={false} zeroMuted={false} />
                <span className="text-num-md font-bold text-ink-faint">
                  {' '}
                  / {formatMoney(progress.goalCents)}
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-num-xl font-extrabold tnum text-ink">
                {formatBps(progress.progressBps, 0)}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {progress.isReached
                  ? 'meta atingida'
                  : `faltam ${formatMoney(progress.remainingCents)}`}
              </p>
            </div>
          </div>

          <ProgressBar
            valueBps={progress.progressBarBps}
            tone={summary.profitCents < 0 ? 'negative' : progress.isReached ? 'positive' : 'accent'}
            className="mt-5"
            height="lg"
          />

          <div className="mt-2 flex justify-between text-2xs text-ink-faint">
            <span>R$ 0</span>
            <span>{formatMoney(progress.goalCents)}</span>
          </div>

          <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat label="Banca inicial" value={<Money cents={data.initialBankrollCents} />} />
            <MiniStat label="Banca-alvo" value={<Money cents={data.targetBankrollCents} />} />
            <MiniStat
              label="Falta para a banca-alvo"
              value={
                data.toTargetCents <= 0 ? (
                  <span className="text-positive">Atingida</span>
                ) : (
                  <Money cents={data.toTargetCents} />
                )
              }
            />
            <MiniStat label="Meta diária" value={<Money cents={data.dailyGoalCents} />} />
          </dl>
        </CardBody>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Gráfico                                                           */}
      {/* ---------------------------------------------------------------- */}
      <Card className="mt-4">
        <CardHeader
          title="Evolução do mês"
          description="Meta acumulada × realizado acumulado, dia a dia."
          actions={
            <Link href={`/metas?ano=${period.year}&mes=${period.month}`}>
              <Button variant="secondary" size="sm">
                Ver por dia
              </Button>
            </Link>
          }
        />
        <CardBody>
          <GoalChart
            points={data.series.map((row) => ({
              date: row.date,
              goalCents: row.cumulativeGoalCents,
              realizedCents: row.cumulativeProfitCents,
              isFuture: row.isFuture,
            }))}
          />
        </CardBody>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Métricas do mês + controle de risco                               */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Números do mês"
            description="Somente entradas do período selecionado."
          />
          <CardBody className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <MiniStat label="Entradas" value={summary.count} />
            <MiniStat label="Greens" value={summary.greens} tone="positive" />
            <MiniStat label="Reds" value={summary.reds} tone="negative" />
            <MiniStat label="Voids" value={summary.voids} />
            <MiniStat label="Cashouts" value={summary.cashouts} tone="warning" />
            <MiniStat label="Em aberto" value={summary.openCount} tone="warning" />
            <MiniStat
              label="Taxa de acerto"
              value={<Percent bps={summary.hitRateBps} fractionDigits={1} />}
            />
            <MiniStat label="Stake total" value={<Money cents={summary.totalStakeVolumeCents} />} />
            <MiniStat label="Maior stake" value={<Money cents={summary.maxStakeCents} />} />
            <MiniStat label="Stake média" value={<Money cents={summary.avgStakeCents} />} />
            <MiniStat
              label="Lucro médio/entrada"
              value={<Result cents={summary.avgProfitCents} />}
            />
            <MiniStat
              label="Prejuízo bruto"
              value={<Money cents={summary.grossLossCents} />}
              tone={summary.grossLossCents > 0 ? 'negative' : 'default'}
            />
            <MiniStat
              label="Lucro bruto"
              value={<Money cents={summary.grossProfitCents} />}
              tone="positive"
            />
            <MiniStat label="Aportes" value={<Money cents={data.monthContributionsCents} />} />
            <MiniStat label="Retiradas" value={<Money cents={data.monthWithdrawalsCents} />} />
            <MiniStat
              label="Exposição em aberto"
              value={<Money cents={summary.openStakeCents} />}
              tone={summary.openStakeCents > 0 ? 'warning' : 'default'}
            />
          </CardBody>
        </Card>

        {/* Controle de risco: painel de instrumentos, nunca um rodapé ------ */}
        <Card>
          <CardHeader title="Controle de risco" description="Limites configurados para a banca." />
          <CardBody className="space-y-3">
            <div className="rounded-md border border-line bg-elevated/55 p-4">
              <p className="lbl">Stake máxima</p>
              <p className="mt-2 text-num-xl font-extrabold tnum text-ink">
                {formatMoney(data.limits.maxStakeCents)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                {formatBps(context.settings.maxRiskPerEntryBps)} sobre{' '}
                {formatMoney(data.limits.baseCents)}
                {data.limits.cappedByAbsolute ? ' (teto absoluto aplicado)' : ''}
              </p>
            </div>

            {data.stops.map((stop) => (
              <Gauge
                key={stop.scope}
                name={STOP_SCOPE_LABEL[stop.scope]}
                valueBps={stop.usageBps}
                tone={stop.isHit ? 'negative' : stop.isNear ? 'warning' : 'positive'}
                readout={formatBps(stop.usageBps, 0)}
                footLeft={`${formatMoney(stop.lossCents)} perdidos`}
                footRight={`limite ${formatMoney(stop.limitCents)}`}
              />
            ))}
          </CardBody>
          <CardFooter>
            O sistema nunca aumenta limites sozinho nem sugere elevar stake para recuperar prejuízo.
          </CardFooter>
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Últimas entradas + sócios                                         */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Últimas entradas"
            description={`Registros mais recentes de ${formatMonthLabel(period.year, period.month)}.`}
            actions={
              <Link href="/entradas">
                <Button variant="secondary" size="sm">
                  Ver todas
                </Button>
              </Link>
            }
          />
          {data.recentEntries.length === 0 ? (
            <EmptyState
              icon={<IconEntries />}
              title="Nenhuma entrada neste mês"
              description="Registre a primeira entrada para começar a acompanhar a banca."
              action={
                <Link href="/entradas">
                  <Button variant="primary" size="sm">
                    Registrar entrada
                  </Button>
                </Link>
              }
            />
          ) : (
            <>
              {/* Celular: cada entrada vira um cartão de lista */}
              <ul className="space-y-2.5 px-5 pb-5 md:hidden">
                {data.recentEntries.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-md border border-line bg-elevated/45 p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-ink">{entry.event}</p>
                        <p className="truncate text-xs text-ink-faint">{entry.market}</p>
                      </div>
                      <EntryStatusBadge status={entry.status} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-2.5 text-xs">
                      <span className="truncate text-ink-faint">
                        {formatDateBR(entry.occurredOn)} · {entry.memberName}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="tnum text-ink-muted">{formatMoney(entry.stakeCents)}</span>
                        {entry.status === 'OPEN' ? (
                          <span className="text-ink-faint">—</span>
                        ) : (
                          <Result cents={entry.profitCents} className="text-[13px]" />
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Desktop: a mesma informação em tabela */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="table-head">
                      <th className="px-5 py-3 font-extrabold">Data</th>
                      <th className="px-3 py-3 font-extrabold">Evento</th>
                      <th className="px-3 py-3 font-extrabold">Responsável</th>
                      <th className="px-3 py-3 text-right font-extrabold">Stake</th>
                      <th className="px-3 py-3 text-center font-extrabold">Status</th>
                      <th className="px-5 py-3 text-right font-extrabold">Resultado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.recentEntries.map((entry) => (
                      <tr key={entry.id} className="row-hover">
                        <td className="whitespace-nowrap px-5 py-3.5 text-xs text-ink-muted">
                          {formatDateBR(entry.occurredOn)}
                        </td>
                        <td className="max-w-[220px] px-3 py-3.5">
                          <p className="truncate font-semibold text-ink">{entry.event}</p>
                          <p className="truncate text-xs text-ink-faint">{entry.market}</p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-xs text-ink-muted">
                          {entry.memberName}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right tnum text-ink-muted">
                          {formatMoney(entry.stakeCents)}
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          <EntryStatusBadge status={entry.status} />
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-right">
                          {entry.status === 'OPEN' ? (
                            <span className="text-xs text-ink-faint">—</span>
                          ) : (
                            <Result cents={entry.profitCents} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Sócios no mês"
            description="Rateio do lucro do período conforme a participação."
            actions={
              <Link href="/socios">
                <Button variant="ghost" size="sm">
                  Detalhes
                </Button>
              </Link>
            }
          />
          {data.partners.partners.length === 0 ? (
            <EmptyState title="Nenhum sócio cadastrado" icon={<IconTransfer />} />
          ) : (
            <CardBody className="space-y-3">
              {data.partners.partners.map((partner) => (
                <div
                  key={partner.memberId}
                  className="flex items-center justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{partner.displayName}</p>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {formatBps(partner.shareBps, 0)} de participação
                    </p>
                  </div>
                  <Result cents={partner.profitShareCents} className="text-[15px] font-extrabold" />
                </div>
              ))}

              {data.partners.unassignedContributionsCents > 0 ||
              data.partners.unassignedWithdrawalsCents > 0 ? (
                <p className="pt-1 text-xs leading-relaxed text-ink-faint">
                  Há movimentações sem sócio vinculado no mês (
                  {formatMoney(data.partners.unassignedContributionsCents)} em aportes e{' '}
                  {formatMoney(data.partners.unassignedWithdrawalsCents)} em retiradas). Elas entram
                  na banca, mas não no saldo de nenhum sócio.
                </p>
              ) : null}
            </CardBody>
          )}
        </Card>
      </div>

      {/* Entradas em aberto ------------------------------------------------ */}
      {data.openEntries.length > 0 ? (
        <Card className="mt-4">
          <CardHeader
            title="Entradas em aberto"
            description="Ainda não resolvidas — não entram no lucro nem na banca."
            actions={<Badge tone="dashed">{data.openEntries.length}</Badge>}
          />
          <CardBody className="flex flex-wrap gap-2">
            {data.openEntries.slice(0, 12).map((entry) => (
              <span
                key={entry.id}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-dashed border-line-strong px-3.5 text-xs"
              >
                <IconAlert className="text-warning" />
                <span className="font-semibold text-ink">{entry.event}</span>
                <span className="tnum text-ink-faint">{formatMoney(entry.stakeCents)}</span>
              </span>
            ))}
          </CardBody>
        </Card>
      ) : null}

      {/* Comparação histórica ---------------------------------------------- */}
      <Card className="mt-4">
        <CardHeader title="Resultado acumulado (todo o histórico)" />
        <CardBody className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MiniStat label="Entradas" value={data.allTimeSummary.count} />
          <MiniStat label="Lucro total" value={<Result cents={data.allTimeSummary.profitCents} />} />
          <MiniStat label="ROI total" value={<ResultPercent bps={data.allTimeSummary.roiBps} />} />
          <MiniStat
            label="Taxa de acerto"
            value={<Percent bps={data.allTimeSummary.hitRateBps} fractionDigits={1} />}
          />
          <MiniStat label="Aportes" value={<Money cents={data.allTimeContributionsCents} />} />
          <MiniStat label="Retiradas" value={<Money cents={data.allTimeWithdrawalsCents} />} />
        </CardBody>
      </Card>
    </>
  );
}
