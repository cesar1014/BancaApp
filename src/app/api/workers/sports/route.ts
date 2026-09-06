import { NextResponse, type NextRequest } from 'next/server';
import { runAllJobs, runJob, type JobName } from '@/lib/services/sports/engine';
import { getSportsRuntime, workerSecret } from '@/lib/services/sports/runtime';

export const dynamic = 'force-dynamic';

/**
 * SEM maxDuration, de propósito.
 *
 * Declarar 60 s aqui derrubou o deploy: no plano gratuito da Vercel o teto de
 * execução é 10 s, a menos que Fluid Compute esteja ligado, e um valor acima
 * do permitido faz a plataforma recusar a publicação inteira — em silêncio,
 * do ponto de vista de quem só olha o site, que continua servindo o build
 * anterior.
 *
 * Vale o padrão da plataforma. As rotinas gravam de forma incremental, então
 * uma interrupção não perde o que já foi escrito: a chamada seguinte continua
 * de onde parou, e o agendador chama a cada cinco minutos.
 */

const JOBS: readonly JobName[] = ['fixtures', 'live', 'odds', 'settle', 'performance'];

/**
 * Worker da Central de Dicas.
 *
 *   GET/POST /api/workers/sports?job=live        uma rotina
 *   GET/POST /api/workers/sports?job=all         todas, em ordem
 *
 * Autenticação por segredo (WORKER_SECRET), nunca por sessão de usuário:
 *   Authorization: Bearer <WORKER_SECRET>   ou   ?secret=<WORKER_SECRET>
 *
 * Pensado para cron externo (Vercel Cron, GitHub Actions, cron-job.org) ou
 * para o script local `npm run sports:worker`. Cada rotina respeita seu
 * próprio cooldown, então chamar com frequência não gasta quota extra.
 */
async function handle(request: NextRequest): Promise<NextResponse> {
  const secret = workerSecret();
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'WORKER_SECRET não configurado (mínimo 16 caracteres).' }, { status: 503 });
  }

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : request.nextUrl.searchParams.get('secret') ?? '';
  if (!provided || !timingSafeEqual(provided, secret)) {
    return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
  }

  const job = (request.nextUrl.searchParams.get('job') ?? 'all').toLowerCase();

  /**
   * Diagnóstico de configuração.
   *
   *   GET /api/workers/sports?job=config
   *
   * Existe porque "modo simulação bloqueado" tem duas causas — o modo não é
   * live, ou é live mas nenhuma chave foi configurada — e de fora não dava
   * para saber qual. Diagnosticar isso por tentativa e erro em produção custa
   * caro; a rota responde de uma vez.
   *
   * Devolve apenas se cada variável está PREENCHIDA, nunca o valor. Um
   * endpoint de diagnóstico que vaza chave é uma porta dos fundos.
   */
  if (job === 'config') {
    const runtime = getSportsRuntime();
    const preenchida = (nome: string) => (process.env[nome] ?? '').trim().length > 0;
    return NextResponse.json({
      ok: true,
      modo: process.env.DATA_PROVIDER_MODE ?? '(não definida)',
      chaves: {
        API_FOOTBALL_KEY: preenchida('API_FOOTBALL_KEY'),
        THE_ODDS_API_KEY: preenchida('THE_ODDS_API_KEY'),
        SPORTMONKS_API_KEY: preenchida('SPORTMONKS_API_KEY'),
        THE_ODDS_API_REGIONS: process.env.THE_ODDS_API_REGIONS ?? '(não definida)',
      },
      provedoresAtivos: runtime.providers.keys,
      caiuNoSimulador: runtime.providers.mode === 'mock' || runtime.providers.usingMockFallback,
      refreshAoAbrirPagina: runtime.refreshOnView,
    });
  }

  try {
    if (job === 'all') {
      const reports = await runAllJobs();
      return NextResponse.json({ ok: true, reports });
    }
    if (!JOBS.includes(job as JobName)) {
      return NextResponse.json({ ok: false, error: `Rotina desconhecida: ${job}` }, { status: 400 });
    }
    const report = await runJob(job as JobName);
    return NextResponse.json({ ok: true, reports: [report] });
  } catch (error) {
    console.error('[sports-worker] falha', error);
    return NextResponse.json({ ok: false, error: 'Falha ao executar a rotina.' }, { status: 500 });
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const GET = handle;
export const POST = handle;
