import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext } from '@/lib/services/context';
import { listAllEntries, listDistinctValues, listEntries } from '@/lib/repos/entries';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { MiniStat } from '@/components/ui/stat';
import { Money, Percent, Result, ResultPercent } from '@/components/ui/money';
import { Pagination } from '@/components/ui/pagination';
import { HistoryFilters, type HistoryFilterValues } from '@/components/history/history-filters';
import { EntriesTable } from '@/components/entries/entries-table';
import { summarizeEntries } from '@/lib/domain/metrics';
import { isIsoDate } from '@/lib/datetime';
import { parseMoneyToCents } from '@/lib/money';
import { parseOddToMilli } from '@/lib/numbers';
import { first } from '@/lib/period';
import { ENTRY_STATUSES, type EntryStatus } from '@/lib/domain/types';
import type { EntryFilters } from '@/lib/repos/entries';

export const metadata: Metadata = { title: 'Histórico' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

function readStatuses(value: string | string[] | undefined): EntryStatus[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.filter((item): item is EntryStatus =>
    (ENTRY_STATUSES as readonly string[]).includes(item),
  );
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const params = await searchParams;

  const raw: HistoryFilterValues = {
    de: first(params.de) ?? '',
    ate: first(params.ate) ?? '',
    socio: first(params.socio) ?? '',
    esporte: first(params.esporte) ?? '',
    mercado: first(params.mercado) ?? '',
    status: readStatuses(params.status),
    oddMin: first(params.oddMin) ?? '',
    oddMax: first(params.oddMax) ?? '',
    stakeMin: first(params.stakeMin) ?? '',
    stakeMax: first(params.stakeMax) ?? '',
    busca: first(params.busca) ?? '',
  };

  // Toda conversão acontece no servidor; nada é confiado ao que veio da URL.
  const filters: EntryFilters = {
    dateFrom: isIsoDate(raw.de) ? raw.de : null,
    dateTo: isIsoDate(raw.ate) ? raw.ate : null,
    memberId: raw.socio || null,
    statuses: raw.status.length > 0 ? raw.status : null,
    sport: raw.esporte || null,
    market: raw.mercado || null,
    oddMinMilli: parseOddToMilli(raw.oddMin),
    oddMaxMilli: parseOddToMilli(raw.oddMax),
    stakeMinCents: parseMoneyToCents(raw.stakeMin),
    stakeMaxCents: parseMoneyToCents(raw.stakeMax),
    search: raw.busca || null,
  };

  const page = Math.max(Number(first(params.pagina) ?? '1') || 1, 1);

  const [pageResult, allFiltered, distinct] = await Promise.all([
    listEntries(context.bankroll.id, filters, { page, pageSize: PAGE_SIZE }),
    listAllEntries(context.bankroll.id, filters),
    listDistinctValues(context.bankroll.id),
  ]);

  const summary = summarizeEntries(allFiltered);

  return (
    <>
      <PageHeader
        title="Histórico"
        description="Todas as entradas da banca, com filtros combináveis. Os totais abaixo consideram apenas o resultado filtrado."
      />

      <Card className="mb-5">
        <CardHeader title="Filtros" />
        <CardBody>
          <HistoryFilters
            values={raw}
            members={context.members}
            sports={distinct.sports}
            markets={distinct.markets}
          />
        </CardBody>
      </Card>

      <Card className="mb-5">
        <CardHeader
          title="Resultado dos filtros"
          description={`${summary.count} entrada(s) encontradas.`}
        />
        <CardBody className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MiniStat label="Total apostado" value={<Money cents={summary.totalStakedCents} />} />
          <MiniStat label="Lucro" value={<Result cents={summary.profitCents} />} />
          <MiniStat label="ROI" value={<ResultPercent bps={summary.roiBps} />} />
          <MiniStat label="Greens" value={summary.greens} tone="positive" />
          <MiniStat label="Reds" value={summary.reds} tone="negative" />
          <MiniStat
            label="Taxa de acerto"
            value={<Percent bps={summary.hitRateBps} fractionDigits={1} />}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Entradas" description="Ordenadas da mais recente para a mais antiga." />
        {/* Somente leitura: a edição acontece na página Entradas. */}
        <EntriesTable entries={pageResult.entries} permissions={null} />
        <Pagination
          page={pageResult.page}
          pageCount={pageResult.pageCount}
          total={pageResult.total}
          pageSize={pageResult.pageSize}
        />
      </Card>
    </>
  );
}
