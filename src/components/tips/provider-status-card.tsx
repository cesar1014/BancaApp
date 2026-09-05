import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge, type Tone } from '@/components/ui/badge';
import { Gauge } from '@/components/ui/stat';
import { ECONOMY_MODE_LABEL } from '@/lib/sports/config/cache-policy';
import type { ProviderStatusView } from '@/lib/services/sports/tips.service';
import { formatDateTimeBR } from '@/lib/datetime';
import { RefreshTipsButton } from './refresh-button';

const STATUS_TONE: Record<string, Tone> = { OK: 'positive', ECONOMY: 'warning', CRITICAL: 'negative', EXHAUSTED: 'negative', DISABLED: 'muted' };
const STATUS_LABEL: Record<string, string> = { OK: 'Normal', ECONOMY: 'Economia', CRITICAL: 'Crítico', EXHAUSTED: 'Esgotado', DISABLED: 'Desligado' };

/** Painel administrativo dos provedores: quota, modo, cache e rotinas. */
export function ProviderStatusCard({ status, timezone }: { status: ProviderStatusView; timezone: string }) {
  return (
    <Card>
      <CardHeader
        title="Provedores de dados (Central de Dicas)"
        description={
          status.mode === 'mock'
            ? 'Modo simulação: nenhuma API externa é consultada. Configure as chaves e DATA_PROVIDER_MODE=live para dados reais.'
            : status.usingMockFallback
              ? 'Modo live sem nenhuma chave configurada — o sistema caiu para a simulação.'
              : `Modo live · economia ${ECONOMY_MODE_LABEL[status.economyMode].toLowerCase()}.`
        }
        actions={<RefreshTipsButton />}
      />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {status.providers.map((provider) => {
            const q = provider.quota;
            const used = q && q.requestLimit !== null && q.remaining !== null ? q.requestLimit - q.remaining : (q?.requestsUsed ?? 0);
            const usageBps = q && q.requestLimit ? Math.min(10_000, Math.round((used / q.requestLimit) * 10_000)) : 0;
            return (
              <div key={provider.key} className="space-y-2">
                <Gauge
                  name={provider.label}
                  valueBps={usageBps}
                  tone={usageBps >= 8_800 ? 'negative' : usageBps >= 6_500 ? 'warning' : 'positive'}
                  readout={q && q.requestLimit !== null ? `${used}/${q.requestLimit}` : provider.key === 'mock' ? 'sem limite' : `${q?.requestsUsed ?? 0} usadas`}
                  footLeft={q?.status ? <Badge tone={STATUS_TONE[q.status] ?? 'neutral'}>{STATUS_LABEL[q.status] ?? q.status}</Badge> : null}
                  footRight={q?.resetAt ? `reset ${formatDateTimeBR(q.resetAt, timezone)}` : null}
                />
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 text-xs text-ink-muted sm:grid-cols-2">
          <div className="rounded-md border border-line bg-elevated/50 p-3">
            <p className="lbl mb-1.5">Cache</p>
            <p className="tnum">
              {status.cache.hits} acertos · {status.cache.staleHits} vencidos usados · {status.cache.misses} consultas · {status.cache.deduped} deduplicadas
            </p>
            <p className="mt-1 text-ink-faint">Refresh ao abrir páginas: {status.refreshOnView ? 'ligado' : 'desligado (só worker)'}</p>
          </div>
          <div className="rounded-md border border-line bg-elevated/50 p-3">
            <p className="lbl mb-1.5">Rotinas</p>
            {status.jobs.length === 0 ? (
              <p className="text-ink-faint">Nenhuma rotina executada ainda.</p>
            ) : (
              <ul className="space-y-0.5">
                {status.jobs.map((job) => (
                  <li key={job.job} className="flex justify-between gap-2">
                    <span className="font-bold text-ink">{job.job}</span>
                    <span className="truncate text-right">
                      {job.lastRunAt ? formatDateTimeBR(job.lastRunAt, timezone) : '—'} · {job.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardBody>
      <CardFooter>
        Quando uma API se aproxima do limite, o sistema entra em economia sozinho: aumenta o cache, reduz o funil e prioriza partidas com entrada identificada. As chaves ficam somente no servidor.
      </CardFooter>
    </Card>
  );
}
