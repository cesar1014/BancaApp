import type { ReactNode } from 'react';
import { requireUser } from '@/lib/auth/session';
import { listLiveFixtures } from '@/lib/repos/sports';
import { PageHeader } from '@/components/layout/page-header';
import { TipsTabs } from '@/components/tips/tips-tabs';

export const dynamic = 'force-dynamic';

export default async function TipsLayout({ children }: { children: ReactNode }) {
  await requireUser();
  const live = await listLiveFixtures().catch(() => []);

  return (
    <>
      <PageHeader
        title="Central de Dicas"
        description="Análise pré-jogo e ao vivo com probabilidade estimada e value. Toda indicação é uma leitura do modelo — nunca uma certeza. A decisão e o controle de risco continuam sendo seus."
      />
      <TipsTabs liveCount={live.length} />
      {children}
      <p className="mt-8 text-center text-xs leading-relaxed text-ink-faint">
        Probabilidades são estimativas do modelo a partir dos dados disponíveis no momento. Odds podem mudar antes de você apostar.
        <br />
        Registre as entradas na banca normalmente — os limites de risco valem para qualquer dica.
      </p>
    </>
  );
}
