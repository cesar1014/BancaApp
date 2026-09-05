import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext } from '@/lib/services/context';
import { loadUpcomingSlips } from '@/lib/services/bilhetes.service';
import { SlipCard, SlipListEmpty } from '@/components/bilhetes/slip-card';
import { formatDateBR, weekdayShort } from '@/lib/datetime';

export const metadata: Metadata = { title: 'Bilhetes · Próximos' };
export const dynamic = 'force-dynamic';

export default async function SlipsUpcomingPage() {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const data = await loadUpcomingSlips(context.today);
  const canManage = context.permissions.isAdmin;

  const byDate = new Map<string, typeof data.slips>();
  for (const slip of data.slips) (byDate.get(slip.referenceDate) ?? byDate.set(slip.referenceDate, []).get(slip.referenceDate)!).push(slip);

  if (data.slips.length === 0) {
    return <SlipListEmpty reason="Poucas fontes publicam bilhetes com antecedência (APWin e Apostas e Palpites mostram o de amanhã). Volte mais tarde ou veja os de hoje." />;
  }

  return (
    <div className="space-y-6">
      {[...byDate.entries()].map(([date, slips]) => (
        <section key={date}>
          <h2 className="lbl mb-3">
            {weekdayShort(date)} {formatDateBR(date)} · {slips.length}
          </h2>
          <div className="grid gap-4 xl:grid-cols-2">
            {slips.map((slip) => (
              <SlipCard key={slip.id} slip={slip} timezone={context.bankroll.timezone} canManage={canManage} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
