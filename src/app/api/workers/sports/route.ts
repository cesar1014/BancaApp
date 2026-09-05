import { NextResponse, type NextRequest } from 'next/server';
import { runAllJobs, runJob, type JobName } from '@/lib/services/sports/engine';
import { workerSecret } from '@/lib/services/sports/runtime';

export const dynamic = 'force-dynamic';

// Sem maxDuration: o valor máximo varia por plano da Vercel e declarar um
// número acima do permitido faz o deploy ser recusado. O trabalho é salvo
// de forma incremental — se a plataforma interromper, a chamada seguinte
// continua de onde parou, respeitando os mesmos cooldowns.

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
