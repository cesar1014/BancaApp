import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext, loadBankrollState } from '@/lib/services/context';
import { selectableMembers } from '@/lib/services/entries.service';
import { listAllEntries, listDistinctValues } from '@/lib/repos/entries';
import { listMatchOptions } from '@/lib/services/entries.service';
import { findClosing } from '@/lib/repos/closings';
import { canCreateEntry, canOverrideRisk } from '@/lib/auth/permissions';
import { resolvePeriod } from '@/lib/period';
import { PageHeader } from '@/components/layout/page-header';
import { MonthPicker } from '@/components/layout/month-picker';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { MiniStat } from '@/components/ui/stat';
import { Money, Percent, Result } from '@/components/ui/money';
import { Notice } from '@/components/ui/feedback';
import { EntriesPageClient } from '@/components/entries/entries-page-client';
import { summarizeEntries } from '@/lib/domain/metrics';
import { monthRange, formatMonthLabel, monthOfDate, timeNowIn } from '@/lib/datetime';
import { formatMoney } from '@/lib/money';

export const metadata: Metadata = { title: 'Entradas' };
export const dynamic = 'force-dynamic';

export default async function EntriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const params = await searchParams;
  const period = resolvePeriod(params, context.today);
  const range = monthRange(period.year, period.month);

  const [entries, state, members, distinct, closing, matches] = await Promise.all([
    listAllEntries(context.bankroll.id, { dateFrom: range.start, dateTo: range.end }),
    loadBankrollState(context.bankroll.id, context.settings, period.year, period.month),
    selectableMembers(user).catch(() => []),
    listDistinctValues(context.bankroll.id),
    findClosing(context.bankroll.id, period.year, period.month),
    listMatchOptions(context.bankroll.timezone),
  ]);

  const summary = summarizeEntries(entries);
  const current = monthOfDate(context.today);
  const ordered = [...entries].reverse();

  const allowCreate = canCreateEntry(user, context.settings) && closing === null;

  return (
    <>
      <PageHeader
        title="Entradas"
        description={`Registro das apostas de ${formatMonthLabel(period.year, period.month)}. O lucro é calculado pelo servidor a cada gravação.`}
        actions={
          <MonthPicker
            year={period.year}
            month={period.month}
            maxYear={current.year}
            maxMonth={current.month}
          />
        }
      />

      {closing ? (
        <Notice tone="info" title="Mês fechado" className="mb-5">
          {formatMonthLabel(period.year, period.month)} foi fechado em{' '}
          {new Date(closing.closedAt).toLocaleDateString('pt-BR')} e não aceita novos registros nem
          alterações. Reabra o fechamento se precisar corrigir algo.
        </Notice>
      ) : null}

      {!closing && !canCreateEntry(user, context.settings) ? (
        <Notice tone="info" title="Somente leitura" className="mb-5">
          Seu perfil não tem permissão para registrar entradas nesta banca. Fale com o
          administrador.
        </Notice>
      ) : null}

      <Card className="mb-5">
        <CardHeader
          title="Resumo do mês"
          description={`Stake máxima por entrada: ${formatMoney(state.limits.maxStakeCents)}.`}
        />
        <CardBody className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MiniStat label="Entradas" value={summary.count} />
          <MiniStat label="Resolvidas" value={summary.settledCount} />
          <MiniStat label="Em aberto" value={summary.openCount} tone="accent" />
          <MiniStat label="Stake total" value={<Money cents={summary.totalStakeVolumeCents} />} />
          <MiniStat label="Resultado" value={<Result cents={summary.profitCents} />} />
          <MiniStat label="Taxa de acerto" value={<Percent bps={summary.hitRateBps} fractionDigits={1} />} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`Entradas de ${formatMonthLabel(period.year, period.month)}`}
          description="Mais recentes primeiro."
        />
        <div className="p-5 pt-4">
          <EntriesPageClient
            user={user}
            entries={ordered}
            members={members}
            canCreate={allowCreate}
            canOverrideRisk={canOverrideRisk(user)}
            maxStakeCents={state.limits.maxStakeCents}
            today={context.today}
            now={timeNowIn(context.bankroll.timezone)}
            markets={distinct.markets}
            matches={matches}
          />
        </div>
      </Card>
    </>
  );
}
