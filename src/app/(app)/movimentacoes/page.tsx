import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext, loadBankrollState } from '@/lib/services/context';
import { listTransactions } from '@/lib/repos/transactions';
import { summarizeTransactions } from '@/lib/domain/metrics';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { MiniStat } from '@/components/ui/stat';
import { Money } from '@/components/ui/money';
import { Notice } from '@/components/ui/feedback';
import { TransactionsPanel } from '@/components/transactions/transactions-panel';
import { monthOfDate } from '@/lib/datetime';

export const metadata: Metadata = { title: 'Movimentações' };
export const dynamic = 'force-dynamic';

export default async function TransactionsPage() {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const current = monthOfDate(context.today);

  const [transactions, state] = await Promise.all([
    listTransactions(context.bankroll.id),
    loadBankrollState(context.bankroll.id, context.settings, current.year, current.month),
  ]);

  const summary = summarizeTransactions(transactions);

  return (
    <>
      <PageHeader
        title="Aportes e retiradas"
        description="Movimentações de caixa da banca. Elas alteram o saldo disponível, mas jamais são contabilizadas como lucro ou prejuízo das entradas."
      />

      <Notice tone="info" className="mb-5" title="Como isso entra nas contas">
        Banca = banca inicial + lucro das entradas + aportes − retiradas. O ROI e a taxa de acerto
        continuam olhando somente para as entradas.
      </Notice>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Aportes" value={<Money cents={summary.contributionsCents} />} tone="positive" />
        <MiniStat label="Retiradas" value={<Money cents={summary.withdrawalsCents} />} tone="warning" />
        <MiniStat label="Saldo de caixa" value={<Money cents={summary.netCents} />} />
        <MiniStat label="Banca atual" value={<Money cents={state.currentBankrollCents} />} />
      </div>

      <Card>
        <CardHeader
          title="Movimentações"
          description={`${transactions.length} registro(s), da mais recente para a mais antiga.`}
        />
        <CardBody>
          <TransactionsPanel
            transactions={transactions}
            members={context.members}
            canManage={context.permissions.canManageTransactions}
            today={context.today}
          />
        </CardBody>
      </Card>
    </>
  );
}
