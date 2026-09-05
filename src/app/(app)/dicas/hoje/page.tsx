import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext } from '@/lib/services/context';
import { loadToday, type TodayGroup } from '@/lib/services/sports/tips.service';
import { first } from '@/lib/period';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { IconTips } from '@/components/icons';
import { TodayFilters } from '@/components/tips/today-filters';
import { FixtureRow } from '@/components/tips/fixture-row';
import { formatDateBR } from '@/lib/datetime';
import type { MarketKey, TipConfidence } from '@/lib/sports/domain/models';

export const metadata: Metadata = { title: 'Dicas · Hoje' };
export const dynamic = 'force-dynamic';

const GROUPS: TodayGroup[] = ['todas', 'analisando', 'oportunidade', 'ignoradas'];

export default async function TipsTodayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const params = await searchParams;

  const group = first(params.grupo) as TodayGroup | undefined;
  const data = await loadToday(context.today, context.bankroll.timezone, {
    league: first(params.liga) ?? null,
    hour: first(params.hora) ?? null,
    market: (first(params.mercado) as MarketKey | undefined) ?? null,
    confidence: (first(params.confianca) as TipConfidence | undefined) ?? null,
    group: group && GROUPS.includes(group) ? group : 'todas',
  });

  const live = data.fixtures.filter((f) => f.status === 'LIVE' || f.status === 'HALFTIME');
  const upcoming = data.fixtures.filter((f) => f.status === 'SCHEDULED');
  const finished = data.fixtures.filter((f) => f.status === 'FINISHED' || f.status === 'CANCELLED' || f.status === 'POSTPONED');

  return (
    <>
      <Card className="mb-4">
        <CardHeader title={`Partidas de ${formatDateBR(context.today)}`} description="Todas as partidas do dia nas competições acompanhadas, com o estágio de análise de cada uma." />
        <CardBody>
          <TodayFilters leagues={data.leagues} counts={data.counts} />
        </CardBody>
      </Card>

      {data.fixtures.length === 0 ? (
        <Card>
          <EmptyState icon={<IconTips />} title="Nenhuma partida para este filtro" description="Ajuste os filtros ou aguarde a próxima atualização do calendário." />
        </Card>
      ) : (
        <div className="space-y-6">
          {live.length > 0 ? <Section title="Ao vivo agora" fixtures={live} timezone={data.timezone} /> : null}
          {upcoming.length > 0 ? <Section title="Ainda por começar" fixtures={upcoming} timezone={data.timezone} /> : null}
          {finished.length > 0 ? <Section title="Encerradas" fixtures={finished} timezone={data.timezone} /> : null}
        </div>
      )}
    </>
  );
}

function Section({ title, fixtures, timezone }: { title: string; fixtures: Parameters<typeof FixtureRow>[0]['view'][]; timezone: string }) {
  return (
    <section>
      <h2 className="lbl mb-3">
        {title} · {fixtures.length}
      </h2>
      <ul className="space-y-2">
        {fixtures.map((view) => (
          <FixtureRow key={view.id} view={view} timezone={timezone} />
        ))}
      </ul>
    </section>
  );
}
