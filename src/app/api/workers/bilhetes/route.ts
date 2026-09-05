import { NextResponse, type NextRequest } from 'next/server';
import { collectAllSources, settleOpenSlips, verifyOpenSlips } from '@/lib/services/bilhetes.service';
import { workerSecret } from '@/lib/services/sports/runtime';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Worker dos Bilhetes.
 *
 *   POST /api/workers/bilhetes?job=collect   coleta todas as fontes ativas (respeita cooldown)
 *   POST /api/workers/bilhetes?job=verify    confere odds reais dos bilhetes abertos
 *   POST /api/workers/bilhetes?job=settle    liquida o que já terminou
 *   POST /api/workers/bilhetes                os três, em ordem (padrão)
 *   &force=1                                 ignora o cooldown das fontes
 *
 * Autenticação: Authorization: Bearer <TIPS_WORKER_SECRET ou WORKER_SECRET>.
 * Cron sugerido: 08:00 e 14:00 no fuso da banca para `collect`, e a cada
 * hora para `settle`.
 */
async function handle(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.TIPS_WORKER_SECRET?.trim() || workerSecret();
  if (!secret || secret.length < 16) {
    return NextResponse.json({ ok: false, error: 'TIPS_WORKER_SECRET/WORKER_SECRET não configurado (mínimo 16 caracteres).' }, { status: 503 });
  }
  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : request.nextUrl.searchParams.get('secret') ?? '';
  if (!provided || !timingSafeEqual(provided, secret)) {
    return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
  }

  const job = (request.nextUrl.searchParams.get('job') ?? 'all').toLowerCase();
  const force = request.nextUrl.searchParams.get('force') === '1';
  try {
    if (job === 'collect' || job === 'all') {
      const reports = await collectAllSources({ force });
      return NextResponse.json({ ok: true, job, reports });
    }
    if (job === 'verify') return NextResponse.json({ ok: true, job, report: await verifyOpenSlips() });
    if (job === 'settle') return NextResponse.json({ ok: true, job, report: await settleOpenSlips() });
    return NextResponse.json({ ok: false, error: `Rotina desconhecida: ${job}` }, { status: 400 });
  } catch (error) {
    console.error('[bilhetes-worker] falha', error);
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
