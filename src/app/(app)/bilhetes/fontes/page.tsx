import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext } from '@/lib/services/context';
import { loadSourceScores } from '@/lib/services/bilhetes.service';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card';
import { Notice } from '@/components/ui/feedback';
import { SourcesTable } from '@/components/bilhetes/sources-table';
import { CollectSlipsButton } from '@/components/bilhetes/collect-button';

export const metadata: Metadata = { title: 'Bilhetes · Fontes' };
export const dynamic = 'force-dynamic';

export default async function SlipSourcesPage() {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const sources = await loadSourceScores();
  const canManage = context.permissions.isAdmin;
  const totalSettled = sources.reduce((acc, s) => acc + s.metrics.settled, 0);

  return (
    <>
      <Card>
        <CardHeader
          title="Placar das fontes"
          description="Cada bilhete é liquidado com stake de referência fixa. ROI e yield dizem se a fonte paga; taxa de acerto sozinha não."
          actions={canManage ? <CollectSlipsButton /> : undefined}
        />
        <CardBody className="p-0 lg:p-0">
          <div className="p-4 lg:p-0">
            <SourcesTable sources={sources} timezone={context.bankroll.timezone} canManage={canManage} />
          </div>
        </CardBody>
        <CardFooter>
          Ordenação por ROI. Yield = lucro ÷ volume arriscado (push fora); ROI = lucro ÷ stake × bilhetes resolvidos. Abaixo de 30 bilhetes resolvidos, qualquer ROI está dentro do ruído.
        </CardFooter>
      </Card>

      {totalSettled < 30 ? (
        <Notice tone="info" title="Ainda é cedo para desligar fontes pelo placar" className="mt-4">
          Há {totalSettled} bilhete{totalSettled === 1 ? '' : 's'} resolvido{totalSettled === 1 ? '' : 's'} no total. Dê algumas semanas de coleta antes de tirar conclusões; o placar acumula sozinho.
        </Notice>
      ) : null}

      <Notice tone="info" title="Como a coleta funciona" className="mt-4">
        Uma requisição por fonte por dia, respeitando o robots.txt de cada site e identificando este app no User-Agent. As páginas desta aba leem apenas o banco; a coleta roda pelo worker agendado ou pelo botão acima.
      </Notice>
    </>
  );
}
