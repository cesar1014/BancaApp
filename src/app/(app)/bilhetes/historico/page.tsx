import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext } from '@/lib/services/context';
import { loadSlipHistory } from '@/lib/services/bilhetes.service';
import { first } from '@/lib/period';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Notice } from '@/components/ui/feedback';
import { Pagination } from '@/components/ui/pagination';
import { MiniStat } from '@/components/ui/stat';
import { Percent, Result, ResultPercent } from '@/components/ui/money';
import { SlipCard, SlipListEmpty } from '@/components/bilhetes/slip-card';
import { SlipHistoryFilters } from '@/components/bilhetes/history-filters';
import type { SlipFilters } from '@/lib/repos/bilhetes';
import type { SlipStatus } from '@/lib/bilhetes/domain/types';
import type { TipResult } from '@/lib/sports/domain/models';

export const metadata: Metadata = { title: 'Bilhetes · Histórico' };
export const dynamic = 'force-dynamic';

export default async function SlipsHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const params = await searchParams;
  const resultado = first(params.resultado);
  const filters: SlipFilters = {
    sourceSlug: first(params.fonte) ?? null,
    result: resultado === 'GREEN' || resultado === 'RED' || resultado === 'PUSH' ? (resultado as TipResult) : null,
    status: resultado === 'OPEN' || resultado === 'PENDING' ? (resultado as SlipStatus) : null,
    dateFrom: first(params.de) ?? null,
    dateTo: first(params.ate) ?? null,
  };
  const page = Math.max(1, Number(first(params.pagina) ?? 1) || 1);
  const data = await loadSlipHistory(filters, page);

  /**
   * Totais do conjunto inteiro das fontes, independente da paginação.
   *
   * Contam apenas bilhetes com TODAS as pernas apuradas — a mesma regra do
   * placar por fonte, e pelo mesmo motivo: um bilhete fecha como RED com uma
   * perna perdida, mas só fecha como GREEN quando todas resolvem, então
   * incluir os incompletos joga o resultado para baixo por construção.
   * `excluded` conta quantos ficaram de fora, para o número pequeno não
   * parecer arbitrário.
   */
  const totals = data.sources.reduce(
    (acc, s) => ({
      settled: acc.settled + s.metrics.settled,
      greens: acc.greens + s.metrics.greens,
      reds: acc.reds + s.metrics.reds,
      profit: acc.profit + s.metrics.profitCents,
      turnover: acc.turnover + s.metrics.turnoverCents,
      excluded: acc.excluded + s.excludedIncomplete,
    }),
    { settled: 0, greens: 0, reds: 0, profit: 0, turnover: 0, excluded: 0 },
  );

  return (
    <>
      <Card className="mb-4">
        <CardHeader title="Filtros" description="Todo bilhete coletado fica registrado com a odd informada, a odd real conferida e o resultado." />
        <CardBody>
          <SlipHistoryFilters sources={data.sources.map((s) => ({ slug: s.slug, name: s.name }))} />
        </CardBody>
      </Card>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MiniStat label="Resolvidos" value={totals.settled} />
        <MiniStat label="Green" value={totals.greens} tone="positive" />
        <MiniStat label="Red" value={totals.reds} tone="negative" />
        <MiniStat label="Win rate" value={<Percent bps={totals.greens + totals.reds === 0 ? null : Math.round((totals.greens / (totals.greens + totals.reds)) * 10_000)} fractionDigits={1} />} />
        <MiniStat label="Lucro (yield)" value={<><Result cents={totals.profit} /> <ResultPercent bps={totals.turnover === 0 ? null : Math.round((totals.profit / totals.turnover) * 10_000)} fractionDigits={1} className="ml-1 text-xs" /></>} />
      </div>

      {totals.excluded > 0 ? (
        <Notice tone="warning" title={`${totals.excluded} bilhete(s) fora da conta acima`}>
          <p>
            Eles têm alguma perna que o sistema não conseguiu apurar — jogo fora das competições acompanhadas, ou
            mercado que o leitor não reconheceu (escanteios por time, chutes de jogador, linhas alternativas).
          </p>
          <p className="mt-1.5">
            Ficam de fora de propósito. Um bilhete fecha como <strong>red</strong> assim que uma perna perde, mas só
            fecha como <strong>green</strong> quando todas resolvem: contar os incompletos empurraria o resultado para
            baixo por construção, e o número diria mais sobre a nossa cobertura do que sobre a fonte. Eles continuam
            listados abaixo, apenas não entram na estatística.
          </p>
        </Notice>
      ) : null}

      <h2 className="lbl mb-3">Bilhetes · {data.page.total}</h2>
      {data.page.views.length === 0 ? (
        <SlipListEmpty reason="Nenhum bilhete neste recorte." />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            {data.page.views.map((slip) => (
              <SlipCard key={slip.id} slip={slip} timezone={context.bankroll.timezone} canManage={context.permissions.isAdmin} showDate />
            ))}
          </div>
          <div className="mt-4">
            <Pagination page={data.page.page} pageCount={data.page.pageCount} total={data.page.total} pageSize={20} />
          </div>
        </>
      )}
    </>
  );
}
