import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Verificação de saúde: responde 200 apenas se o banco estiver acessível.
 *
 * O campo `app` identifica esta aplicação. Parece supérfluo e não é: o
 * agendador precisa saber se está falando com o app certo. Endereço
 * `<projeto>.vercel.app` não é garantido — quando o nome já está tomado, a
 * Vercel entrega outro, e um endereço deduzido pelo nome do projeto pode cair
 * na aplicação de outra pessoa, que responderia 200 alegremente.
 */
export async function GET() {
  try {
    const row = await queryOne<{ ok: number }>('SELECT 1 AS ok');
    return NextResponse.json({ app: 'banca', status: 'ok', database: row?.ok === 1 ? 'up' : 'unknown' });
  } catch (error) {
    console.error('[health] banco indisponível', error);
    return NextResponse.json({ status: 'error', database: 'down' }, { status: 503 });
  }
}
