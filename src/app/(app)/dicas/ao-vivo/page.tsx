import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext } from '@/lib/services/context';
import { loadLive } from '@/lib/services/sports/tips.service';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/badge';
import { IconFlame } from '@/components/icons';
import { LiveMatchCard } from '@/components/tips/live-match-card';
import { LiveAutoRefresh } from '@/components/tips/live-auto-refresh';
import { RefreshTipsButton } from '@/components/tips/refresh-button';
import { LIVE_DISPLAY_LABEL, type LiveDisplayState } from '@/lib/sports/domain/models';

export const metadata: Metadata = { title: 'Dicas · Ao vivo' };
export const dynamic = 'force-dynamic';

const ORDER: LiveDisplayState[] = ['OPORTUNIDADE', 'QUASE_ENTRADA', 'ATENCAO', 'MONITORANDO', 'NORMAL'];

export default async function TipsLivePage() {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const data = await loadLive();
  const now = new Date();

  const counts = new Map<LiveDisplayState, number>();
  for (const view of data.fixtures) counts.set(view.liveState, (counts.get(view.liveState) ?? 0) + 1);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {ORDER.filter((state) => counts.get(state)).map((state) => (
            <Badge key={state} tone={state === 'OPORTUNIDADE' ? 'positive' : state === 'QUASE_ENTRADA' || state === 'ATENCAO' ? 'warning' : 'muted'}>
              {LIVE_DISPLAY_LABEL[state]} · {counts.get(state)}
            </Badge>
          ))}
          <LiveAutoRefresh intervalMs={data.mode === 'NORMAL' ? 45_000 : 120_000} />
        </div>
        {context.permissions.canManageTips ? <RefreshTipsButton job="live" label="Atualizar ao vivo" /> : null}
      </div>

      {data.fixtures.length === 0 ? (
        <Card>
          <EmptyState icon={<IconFlame />} title="Nenhuma partida ao vivo agora" description="Assim que um jogo das competições acompanhadas começar, ele aparece aqui com o estágio de análise." />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.fixtures.map((view) => (
            <LiveMatchCard key={view.id} view={view} now={now} />
          ))}
        </div>
      )}
    </>
  );
}
