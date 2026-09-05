import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext } from '@/lib/services/context';
import { loadUpcoming } from '@/lib/services/sports/tips.service';
import { Card } from '@/components/ui/card';
import { EmptyState, Notice } from '@/components/ui/feedback';
import { IconCalendar } from '@/components/icons';
import { FixtureRow } from '@/components/tips/fixture-row';
import { addDays, formatDateBR, weekdayShort } from '@/lib/datetime';

export const metadata: Metadata = { title: 'Dicas · Próximos' };
export const dynamic = 'force-dynamic';

export default async function TipsUpcomingPage() {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const data = await loadUpcoming(context.today, context.bankroll.timezone);
  const tomorrow = addDays(context.today, 1);

  const empty = data.tomorrow.length === 0 && data.later.length === 0;

  return (
    <>
      <Notice tone="info" title="Análise pré-jogo" className="mb-4">
        Partidas futuras entram no funil por prioridade da competição. As odds pré-jogo são consultadas até 3 h antes do início, quando a análise de Over/Under, Ambas marcam, Resultado e Dupla chance passa a valer.
      </Notice>

      {empty ? (
        <Card>
          <EmptyState icon={<IconCalendar />} title="Nenhuma partida futura carregada" description="O calendário é atualizado algumas vezes por dia. Volte mais tarde ou peça uma atualização manual em Configurações." />
        </Card>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="lbl mb-3">
              Amanhã · {weekdayShort(tomorrow)} {formatDateBR(tomorrow)} · {data.tomorrow.length}
            </h2>
            {data.tomorrow.length === 0 ? (
              <p className="text-xs text-ink-faint">Sem partidas nas competições acompanhadas.</p>
            ) : (
              <ul className="space-y-2">
                {data.tomorrow.map((view) => (
                  <FixtureRow key={view.id} view={view} timezone={data.timezone} />
                ))}
              </ul>
            )}
          </section>

          {data.later.map((day) => (
            <section key={day.date}>
              <h2 className="lbl mb-3">
                {weekdayShort(day.date)} {formatDateBR(day.date)} · {day.fixtures.length}
              </h2>
              <ul className="space-y-2">
                {day.fixtures.map((view) => (
                  <FixtureRow key={view.id} view={view} timezone={data.timezone} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
