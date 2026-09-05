import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext } from '@/lib/services/context';
import { loadSlipsForDay } from '@/lib/services/bilhetes.service';
import { SlipsBrowser } from '@/components/bilhetes/slips-browser';
import { CollectSlipsButton } from '@/components/bilhetes/collect-button';
import { Badge } from '@/components/ui/badge';
import { formatDateBR } from '@/lib/datetime';

export const metadata: Metadata = { title: 'Bilhetes' };
export const dynamic = 'force-dynamic';

export default async function SlipsTodayPage() {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const data = await loadSlipsForDay(context.today);
  const canManage = context.permissions.isAdmin;

  const br = data.slips.filter((s) => s.sourceCountry === 'BR').length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{formatDateBR(context.today)}</Badge>
          <Badge tone="muted">{data.slips.length} bilhete{data.slips.length === 1 ? '' : 's'}</Badge>
          {br > 0 ? <Badge tone="accent">{br} com futebol brasileiro</Badge> : null}
        </div>
        {canManage ? <CollectSlipsButton /> : null}
      </div>

      <SlipsBrowser
        slips={data.slips}
        timezone={context.bankroll.timezone}
        canManage={canManage}
        emptyReason={data.emptyReason}
      />
    </>
  );
}
