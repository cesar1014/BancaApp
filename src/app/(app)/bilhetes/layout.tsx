import type { ReactNode } from 'react';
import { requireUser } from '@/lib/auth/session';
import { PageHeader } from '@/components/layout/page-header';
import { SlipTabs } from '@/components/bilhetes/tabs';

export const dynamic = 'force-dynamic';

export default async function SlipsLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return (
    <>
      <PageHeader
        title="Bilhetes"
        description="Múltiplas publicadas por fontes públicas, com a odd real conferida perna a perna e a margem embutida. São conteúdo de terceiros, não recomendações deste app: a decisão e o controle de risco continuam sendo seus."
      />
      <SlipTabs />
      {children}
      <p className="mt-8 text-center text-xs leading-relaxed text-ink-faint">
        Cada bilhete traz crédito e link para a fonte original. Odds mudam a qualquer momento; a odd real mostrada é a melhor cotação encontrada no momento da conferência.
      </p>
    </>
  );
}
