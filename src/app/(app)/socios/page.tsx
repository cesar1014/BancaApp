import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext } from '@/lib/services/context';
import { listAllEntries } from '@/lib/repos/entries';
import { listTransactions } from '@/lib/repos/transactions';
import { listUsers } from '@/lib/repos/users';
import { computePartnerShares } from '@/lib/domain/partners';
import { summarizeEntries } from '@/lib/domain/metrics';
import { resolvePeriod } from '@/lib/period';
import { PageHeader } from '@/components/layout/page-header';
import { MonthPicker } from '@/components/layout/month-picker';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { MiniStat } from '@/components/ui/stat';
import { Money, Result } from '@/components/ui/money';
import { Notice } from '@/components/ui/feedback';
import { MembersPanel } from '@/components/members/members-panel';
import { UsersPanel } from '@/components/members/users-panel';
import { formatMonthLabel, monthOfDate, monthRange } from '@/lib/datetime';
import { formatMoney } from '@/lib/money';
import { defaultUserPassword } from '@/lib/auth/default-password';

export const metadata: Metadata = { title: 'Sócios' };
export const dynamic = 'force-dynamic';

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const params = await searchParams;
  const period = resolvePeriod(params, context.today);
  const range = monthRange(period.year, period.month);
  const current = monthOfDate(context.today);

  const [monthEntries, monthTransactions, allTransactions, users] = await Promise.all([
    listAllEntries(context.bankroll.id, { dateFrom: range.start, dateTo: range.end }),
    listTransactions(context.bankroll.id, { dateFrom: range.start, dateTo: range.end }),
    listTransactions(context.bankroll.id),
    context.permissions.canManageMembers ? listUsers() : Promise.resolve([]),
  ]);

  const monthSummary = summarizeEntries(monthEntries);

  // Saldo teórico usa TODO o histórico de movimentações; o lucro exibido é o
  // do mês selecionado, para responder "quanto cada um fez neste mês".
  const monthShares = computePartnerShares({
    members: context.members,
    profitCents: monthSummary.profitCents,
    transactions: allTransactions,
  });

  const totalCapital = context.members.reduce(
    (acc, member) => acc + member.initialContributionCents,
    0,
  );
  const capitalMismatch = totalCapital !== context.settings.initialBankrollCents;

  const monthCash = monthTransactions.reduce(
    (acc, tx) => {
      if (tx.kind === 'CONTRIBUTION') acc.contributions += tx.amountCents;
      else acc.withdrawals += tx.amountCents;
      return acc;
    },
    { contributions: 0, withdrawals: 0 },
  );

  return (
    <>
      <PageHeader
        title="Sócios"
        description="Participação, capital investido e resultado de cada integrante. Aporte nunca é contabilizado como lucro."
        actions={
          <MonthPicker
            year={period.year}
            month={period.month}
            maxYear={current.year}
            maxMonth={current.month}
          />
        }
      />

      {capitalMismatch ? (
        <Notice tone="info" title="Capital dos sócios difere da banca inicial" className="mb-5">
          A soma dos aportes iniciais é {formatMoney(totalCapital)}, enquanto a banca inicial
          configurada é {formatMoney(context.settings.initialBankrollCents)}. Não é um erro — só
          verifique se é isso mesmo que você espera.
        </Notice>
      ) : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Sócios ativos" value={context.members.filter((m) => m.isActive).length} />
        <MiniStat label="Capital inicial declarado" value={<Money cents={totalCapital} />} />
        <MiniStat label={`Lucro de ${formatMonthLabel(period.year, period.month)}`} value={<Result cents={monthSummary.profitCents} />} />
        <MiniStat
          label="Movimentações no mês"
          value={
            <span className="text-sm">
              +{formatMoney(monthCash.contributions)} / −{formatMoney(monthCash.withdrawals)}
            </span>
          }
        />
      </div>

      <Card>
        <CardHeader
          title="Participação e saldo"
          description="Saldo teórico = aporte inicial + aportes − retiradas + fatia do lucro do mês selecionado."
        />
        <CardBody>
          <MembersPanel
            members={context.members}
            shares={monthShares.partners}
            totalShareBps={monthShares.totalShareBps}
            isShareValid={monthShares.isShareValid}
            users={users}
            canManage={context.permissions.canManageMembers}
            today={context.today}
            periodLabel={formatMonthLabel(period.year, period.month)}
          />
        </CardBody>
      </Card>

      {context.permissions.canManageMembers ? (
        <Card className="mt-5">
          <CardHeader
            title="Usuários de acesso"
            description="Contas que podem entrar no sistema. Cada pessoa deve ter a sua."
          />
          <CardBody>
            <UsersPanel users={users} defaultPassword={defaultUserPassword()} />
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
