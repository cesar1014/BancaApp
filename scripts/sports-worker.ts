/**
 * Worker local da Central de Dicas: chama o endpoint de rotinas em loop.
 *
 *   npm run sports:worker                → roda "all" a cada 60 s
 *   npm run sports:worker -- --once      → uma rodada e sai
 *   npm run sports:worker -- --job=live  → só a rotina informada
 *
 * Usa APP_URL (padrão http://localhost:3000) e WORKER_SECRET do .env.
 * Cada rotina tem cooldown próprio no servidor: chamar a cada 60 s não
 * gera chamadas extras aos provedores.
 */
import { loadEnv } from './env';

async function main(): Promise<void> {
  loadEnv();
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const secret = process.env.WORKER_SECRET;
  if (!secret) throw new Error('WORKER_SECRET não definido no .env');

  const once = process.argv.includes('--once');
  const jobArg = process.argv.find((arg) => arg.startsWith('--job='));
  const job = jobArg ? jobArg.slice('--job='.length) : 'all';
  const intervalMs = Number(process.env.SPORTS_WORKER_INTERVAL_MS ?? 60_000);

  const tick = async () => {
    const started = Date.now();
    try {
      const response = await fetch(`${base}/api/workers/sports?job=${encodeURIComponent(job)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
      });
      const body = (await response.json()) as { ok: boolean; reports?: { job: string; ran: boolean; message: string }[]; error?: string };
      const stamp = new Date().toISOString().slice(11, 19);
      if (!body.ok) {
        console.log(`[${stamp}] erro: ${body.error ?? response.status}`);
        return;
      }
      for (const report of body.reports ?? []) {
        console.log(`[${stamp}] ${report.job.padEnd(11)} ${report.ran ? '→' : '·'} ${report.message}`);
      }
      console.log(`[${stamp}] rodada concluída em ${Date.now() - started} ms`);
    } catch (error) {
      console.log(`[worker] falha ao chamar ${base}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  await tick();
  if (once) return;
  console.log(`Worker ativo: rotina "${job}" a cada ${Math.round(intervalMs / 1000)} s. Ctrl+C para parar.`);
  setInterval(() => void tick(), intervalMs);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
