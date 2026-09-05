import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext } from '@/lib/services/context';
import { loadHighlights } from '@/lib/services/sports/tips.service';
import { Card, CardBody, CardHeader, SectionTitle } from '@/components/ui/card';
import { EmptyState, Notice } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { IconTips } from '@/components/icons';
import { TipCard } from '@/components/tips/tip-card';
import { OpportunityBlock } from '@/components/tips/opportunity-block';
import { LiveStateBadge } from '@/components/tips/badges';
import { LiveAutoRefresh } from '@/components/tips/live-auto-refresh';
import { RefreshTipsButton } from '@/components/tips/refresh-button';
import { formatMinute } from '@/components/tips/format';

export const metadata: Metadata = { title: 'Dicas' };
export const dynamic = 'force-dynamic';

export default async function TipsHighlightsPage() {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const data = await loadHighlights();
  const now = new Date();

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {data.usingMock ? <Badge tone="dashed">Simulação</Badge> : <Badge tone="neutral">Dados reais</Badge>}
          <Badge tone={data.mode === 'NORMAL' ? 'muted' : 'warning'}>Modo {data.modeLabel.toLowerCase()}</Badge>
          <LiveAutoRefresh intervalMs={60_000} />
        </div>
        {context.permissions.canManageTips ? <RefreshTipsButton /> : null}
      </div>

      <SectionTitle description="Entradas identificadas pelo modelo, ordenadas pelo score. Odd e value são os do momento da indicação.">
        Oportunidades ativas
      </SectionTitle>

      {data.tips.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconTips />}
            title="Nenhuma oportunidade identificada agora"
            description="O motor só publica uma dica quando score, probabilidade e value passam juntos pelos limiares. Acompanhe a aba Ao vivo para ver o que está sendo monitorado."
            action={
              <Link href="/dicas/ao-vivo">
                <Button variant="primary" size="sm">
                  Ver partidas ao vivo
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {data.tips.map((tip) => (
            <TipCard key={tip.id} tip={tip} timezone={context.bankroll.timezone} now={now} />
          ))}
        </div>
      )}

      {data.candidates.length > 0 ? (
        <div className="mt-8">
          <SectionTitle description="Partidas em estágio avançado da análise que ainda não fecharam value ou odd.">
            Quase lá
          </SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.candidates.map((view) => (
              <Card key={view.id}>
                <CardHeader
                  title={
                    <Link href={`/dicas/partida/${encodeURIComponent(view.id)}`} className="hover:text-accent">
                      {view.homeName} <span className="tnum text-accent">{view.score.home} x {view.score.away}</span> {view.awayName}
                    </Link>
                  }
                  description={`${view.league.name} · ${formatMinute(view.status, view.minute)}`}
                  actions={<LiveStateBadge state={view.liveState} />}
                />
                <CardBody className="pt-0">{view.best ? <OpportunityBlock candidate={view.best} now={now} compact /> : null}</CardBody>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      <Notice tone="info" title="Como ler uma dica" className="mt-8">
        Probabilidade estimada é a leitura do modelo; odd justa é 1 ÷ probabilidade; value é quanto a odd disponível está acima da justa. Só há dica quando o valor esperado é positivo — probabilidade alta com odd ruim não vira entrada.
      </Notice>
    </>
  );
}
