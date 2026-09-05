import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext } from '@/lib/services/context';
import { loadHistory } from '@/lib/services/sports/tips.service';
import { first } from '@/lib/period';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { Pagination } from '@/components/ui/pagination';
import { IconHistory } from '@/components/icons';
import { TipHistoryFilters } from '@/components/tips/history-filters';
import { TipCard } from '@/components/tips/tip-card';
import { PerformancePanel } from '@/components/tips/performance-panel';
import type { MarketKey, TipResult } from '@/lib/sports/domain/models';
import type { TipFilters } from '@/lib/repos/tips';

export const metadata: Metadata = { title: 'Dicas · Histórico' };
export const dynamic = 'force-dynamic';

export default async function TipsHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const params = await searchParams;

  const resultado = first(params.resultado);
  const filters: TipFilters = {
    result: resultado && resultado !== 'ATIVAS' ? (resultado as TipResult) : null,
    status: resultado === 'ATIVAS' ? 'ACTIVE' : null,
    market: (first(params.mercado) as MarketKey | undefined) ?? null,
    leagueKey: first(params.liga) ?? null,
    dateFrom: first(params.de) ?? null,
    dateTo: first(params.ate) ?? null,
  };
  const page = Math.max(1, Number(first(params.pagina) ?? 1) || 1);
  const data = await loadHistory(filters, page);
  const now = new Date();
  const leagueNames = Object.fromEntries(data.leagues.map((league) => [league.key, league.name]));

  return (
    <>
      <Card className="mb-4">
        <CardHeader title="Filtros" description="Toda dica gerada fica registrada com o contexto do momento (minuto, placar, estatísticas e odd)." />
        <CardBody>
          <TipHistoryFilters leagues={data.leagues} />
        </CardBody>
      </Card>

      <PerformancePanel breakdown={data.performance} leagueNames={leagueNames} />

      <div className="mt-6">
        <h2 className="lbl mb-3">Dicas · {data.page.total}</h2>
        {data.page.tips.length === 0 ? (
          <Card>
            <EmptyState icon={<IconHistory />} title="Nenhuma dica neste recorte" description="As dicas aparecem aqui assim que o motor identificar entradas. Resultados são liquidados automaticamente ao fim das partidas." />
          </Card>
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              {data.page.tips.map((tip) => (
                <TipCard key={tip.id} tip={tip} timezone={context.bankroll.timezone} now={now} />
              ))}
            </div>
            <div className="mt-4">
              <Pagination page={data.page.page} pageCount={data.page.pageCount} total={data.page.total} pageSize={data.page.pageSize} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
