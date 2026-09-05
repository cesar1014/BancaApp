import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext } from '@/lib/services/context';
import { loadCallsPage } from '@/lib/services/calls.service';
import { CallCard, ChannelScoreboard } from '@/components/bilhetes/call-card';
import { SlipListEmpty } from '@/components/bilhetes/slip-card';
import { Notice } from '@/components/ui/feedback';

export const metadata: Metadata = { title: 'Bilhetes · Calls' };
export const dynamic = 'force-dynamic';

/**
 * Calls avulsas de canais abertos do Telegram.
 *
 * A tela é dois blocos: o placar de cada canal em cima e as calls em ordem
 * cronológica embaixo. O placar é o motivo de a aba existir — a call em si
 * qualquer um lê no Telegram; o que ninguém tem é o histórico honesto de
 * quanto aquele canal rendeu.
 */
export default async function CallsPage() {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const data = await loadCallsPage();

  return (
    <>
      <Notice tone="info" title="O que estas calls são, e o que não são">
        <p>
          Palpites avulsos publicados por canais públicos do Telegram. São conteúdo de terceiros, não recomendações
          deste app.
        </p>
        <p className="mt-1.5">
          Os canais não escrevem qual é a partida — só o mercado e a odd. Por isso aqui não há conferência de odd real
          nem margem, como nos bilhetes. O resultado é o que o próprio canal marcou no post.
        </p>
      </Notice>

      {data.panels.length > 0 ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {data.panels.map((panel) => (
            <ChannelScoreboard key={panel.source.slug} panel={panel} />
          ))}
        </div>
      ) : null}

      <section className="mt-6">
        <h2 className="lbl mb-3">Calls recentes</h2>
        {data.recent.length === 0 ? (
          <SlipListEmpty reason={data.emptyReason ?? 'Nenhuma call coletada ainda.'} />
        ) : (
          <div className="card overflow-hidden">
            {data.recent.map((call) => (
              <CallCard key={call.id} call={call} timezone={context.bankroll.timezone} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
