import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext } from '@/lib/services/context';
import { loadUpcomingSlips } from '@/lib/services/bilhetes.service';
import { SlipsBrowser } from '@/components/bilhetes/slips-browser';

export const metadata: Metadata = { title: 'Bilhetes · Próximos' };
export const dynamic = 'force-dynamic';

export default async function SlipsUpcomingPage() {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const data = await loadUpcomingSlips(context.today);
  const canManage = context.permissions.isAdmin;

  return (
    <SlipsBrowser
      slips={data.slips}
      timezone={context.bankroll.timezone}
      canManage={canManage}
      groupByDate
      emptyReason="Poucas fontes publicam bilhetes com antecedência (APWin e Apostas e Palpites mostram o de amanhã). Volte mais tarde ou veja os de hoje."
    />
  );
}
