import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext } from '@/lib/services/context';
import { loadClosingHistory, previewClosing } from '@/lib/services/closing.service';
import { findClosing } from '@/lib/repos/closings';
import { resolvePeriod } from '@/lib/period';
import { PageHeader } from '@/components/layout/page-header';
import { MonthPicker } from '@/components/layout/month-picker';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { MiniStat } from '@/components/ui/stat';
import { Money, Percent, Result, ResultPercent } from '@/components/ui/money';
import { Badge } from '@/components/ui/badge';
import { EmptyState, Notice } from '@/components/ui/feedback';
import { CloseMonthButton, ReopenMonthButton } from '@/components/closing/closing-actions';
import { BarChart } from '@/components/charts/bar-chart';
import { IconClosing } from '@/components/icons';
import { formatDateTimeBR, formatMonthLabel, formatMonthShort, monthOfDate } from '@/lib/datetime';
import { formatMoney } from '@/lib/money';
import { formatBps } from '@/lib/numbers';

export const metadata: Metadata = { title: 'Fechamento mensal' };
export const dynamic = 'force-dynamic';

export default async function ClosingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const params = await searchParams;
  const period = resolvePeriod(params, context.today);
  const current = monthOfDate(context.today);

  const [closing, preview, history] = await Promise.all([
    findClosing(context.bankroll.id, period.year, period.month),
    previewClosing(context.bankroll.id, period.year, period.month),
    loadClosingHistory(context.bankroll.id),
  ]);

  // Um mês fechado exibe SEMPRE o snapshot gravado, nunca um recálculo.
  const view = closing ? closing.snapshot : preview;
  const isClosed = closing !== null;

  const chartPoints = [...history]
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((item) => ({
      label: formatMonthShort(item.year, item.month),
      valueCents: item.entriesProfitCents,
      referenceCents: item.goalCents,
      caption: `ROI ${formatBps(item.roiBps)} · ${item.entriesCount} entradas`,
    }));

  return (
    <>
      <PageHeader
        title="Fechamento mensal"
        description="Consolidação do mês e histórico dos meses já fechados. Depois de fechado, o mês vira uma fotografia imutável."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {context.permissions.canCloseMonth ? (
              isClosed ? (
                <ReopenMonthButton year={period.year} month={period.month} />
              ) : (
                <CloseMonthButton
                  year={period.year}
                  month={period.month}
                  openEntries={preview.openEntries}
                  closingBankrollCents={preview.closingBankrollCents}
                  profitCents={preview.entriesProfitCents}
                />
              )
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

      {isClosed ? (
        <Notice tone="success" title="Mês fechado" className="mb-5">
          Fechado por {closing.closedByName ?? 'usuário removido'} em{' '}
          {formatDateTimeBR(closing.closedAt, context.bankroll.timezone)}. Os números abaixo vêm da
          fotografia gravada naquele momento e não mudam mais, mesmo que as configurações da banca
          sejam alteradas.
        </Notice>
      ) : (
        <Notice tone="info" title="Prévia do fechamento" className="mb-5">
          Estes números são calculados agora e ainda podem mudar. Ao fechar o mês, eles são gravados
          e o período deixa de aceitar edições.
        </Notice>
      )}

      <Card>
        <CardHeader
          title={`Resumo de ${formatMonthLabel(period.year, period.month)}`}
          actions={isClosed ? <Badge tone="positive">Fechado</Badge> : <Badge tone="accent">Em aberto</Badge>}
        />
        <CardBody className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MiniStat label="Banca inicial do mês" value={<Money cents={view.openingBankrollCents} />} />
            <MiniStat label="Lucro das entradas" value={<Result cents={view.entriesProfitCents} />} />
            <MiniStat label="Aportes" value={<Money cents={view.contributionsCents} />} tone="positive" />
            <MiniStat label="Retiradas" value={<Money cents={view.withdrawalsCents} />} tone="warning" />
            <MiniStat label="Banca final" value={<Money cents={view.closingBankrollCents} />} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MiniStat label="Meta do mês" value={<Money cents={view.goalCents} />} />
            <MiniStat
              label="% da meta atingida"
              value={formatBps(view.goalProgressBps, 1)}
              tone={view.goalProgressBps >= 10_000 ? 'positive' : 'default'}
            />
            <MiniStat label="ROI" value={<ResultPercent bps={view.roiBps} />} />
            <MiniStat label="Total apostado" value={<Money cents={view.totalStakedCents} />} />
            <MiniStat label="Maior stake" value={<Money cents={view.maxStakeCents} />} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MiniStat label="Entradas" value={view.entriesCount} />
            <MiniStat label="Greens" value={view.greens} tone="positive" />
            <MiniStat label="Reds" value={view.reds} tone="negative" />
            <MiniStat label="Voids" value={view.voids} />
            <MiniStat label="Cashouts" value={view.cashouts} tone="warning" />
            <MiniStat label="Taxa de acerto" value={<Percent bps={view.hitRateBps} fractionDigits={1} />} />
          </div>
        </CardBody>
      </Card>

      <Card className="mt-5">
        <CardHeader
          title="Resultado por sócio"
          description="Rateio do lucro do mês conforme a participação vigente."
        />
        {view.partners.length === 0 ? (
          <EmptyState title="Nenhum sócio cadastrado" icon={<IconClosing />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="table-head">
                  <th className="px-5 py-2.5 font-semibold">Sócio</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Participação</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Aportes no mês</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Retiradas no mês</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Lucro proporcional</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {view.partners.map((partner) => (
                  <tr key={partner.memberId} className="row-hover">
                    <td className="px-5 py-3 text-ink">{partner.displayName}</td>
                    <td className="px-3 py-3 text-right">
                      <Percent bps={partner.shareBps} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Money cents={partner.contributionsCents} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Money cents={partner.withdrawalsCents} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Result cents={partner.profitShareCents} />
                    </td>
                    <td className="px-5 py-3 text-right font-medium tnum text-ink">
                      {formatMoney(partner.balanceCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Histórico mensal ------------------------------------------------- */}
      <Card className="mt-5">
        <CardHeader
          title="Histórico mensal"
          description="Comparativo dos meses já fechados. A marca tracejada é a meta de cada mês."
        />
        {history.length === 0 ? (
          <EmptyState
            icon={<IconClosing />}
            title="Nenhum mês fechado ainda"
            description="Quando você fechar o primeiro mês, ele aparece aqui e passa a servir de comparação."
          />
        ) : (
          <>
            <CardBody>
              <BarChart points={chartPoints} />
            </CardBody>
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="table-head">
                    <th className="px-5 py-2.5 font-semibold">Mês</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Banca inicial</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Lucro</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Aportes</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Retiradas</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Banca final</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Meta</th>
                    <th className="px-3 py-2.5 text-right font-semibold">% atingido</th>
                    <th className="px-5 py-2.5 text-right font-semibold">ROI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {history.map((item) => (
                    <tr key={item.id} className="row-hover">
                      <td className="whitespace-nowrap px-5 py-3 text-ink">
                        {formatMonthLabel(item.year, item.month)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Money cents={item.openingBankrollCents} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Result cents={item.entriesProfitCents} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Money cents={item.contributionsCents} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Money cents={item.withdrawalsCents} />
                      </td>
                      <td className="px-3 py-3 text-right font-medium tnum text-ink">
                        {formatMoney(item.closingBankrollCents)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Money cents={item.goalCents} />
                      </td>
                      <td className="px-3 py-3 text-right tnum text-ink-muted">
                        {formatBps(item.goalProgressBps, 1)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <ResultPercent bps={item.roiBps} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
