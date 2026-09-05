import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Verificação de saúde: responde 200 apenas se o banco estiver acessível. */
export async function GET() {
  try {
    const row = await queryOne<{ ok: number }>('SELECT 1 AS ok');
    return NextResponse.json({ status: 'ok', database: row?.ok === 1 ? 'up' : 'unknown' });
  } catch (error) {
    console.error('[health] banco indisponível', error);
    return NextResponse.json({ status: 'error', database: 'down' }, { status: 503 });
  }
}
