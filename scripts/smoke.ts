/**
 * Verificação rápida do banco depois do migrate + seed.
 *
 *   npx tsx scripts/smoke.ts
 *
 * Confere que as tabelas existem, que as contas foram criadas com a senha
 * padrão e que a troca obrigatória está marcada. Não altera nada.
 */
import { Client } from 'pg';
import { loadEnv } from './env';
import { verifyPassword } from '../src/lib/auth/password';
import { defaultUserPassword } from '../src/lib/auth/default-password';

async function main(): Promise<void> {
  loadEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL não definida.');

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const tables = await client.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    console.log(`Tabelas (${tables.rows.length}): ${tables.rows.map((r) => r.table_name).join(', ')}\n`);

    const users = await client.query<{ username: string; name: string; role: string; is_owner: boolean; must_change_password: boolean; password_hash: string }>(
      'SELECT username, name, role, is_owner, must_change_password, password_hash FROM users ORDER BY is_owner DESC, username',
    );
    const password = defaultUserPassword();
    for (const user of users.rows) {
      const ok = await verifyPassword(password, user.password_hash);
      console.log(
        `@${user.username.padEnd(12)} ${user.name.padEnd(8)} ${user.is_owner ? 'DONO ' : '     '} ` +
          `senha padrão: ${ok ? 'ok' : 'NÃO CONFERE'} · troca obrigatória: ${user.must_change_password ? 'sim' : 'não'}`,
      );
    }

    const members = await client.query<{ total: string; shares: string }>(
      'SELECT count(*)::text AS total, sum(share_bps)::text AS shares FROM members',
    );
    const settings = await client.query<{ initial: string; goal: string }>(
      'SELECT initial_bankroll_cents::text AS initial, monthly_goal_cents::text AS goal FROM settings',
    );
    const sources = await client.query<{ total: string }>('SELECT count(*)::text AS total FROM tip_sources');

    console.log(`\nSócios: ${members.rows[0]?.total} · participações somam ${Number(members.rows[0]?.shares ?? 0) / 100}%`);
    console.log(`Banca inicial: R$ ${Number(settings.rows[0]?.initial ?? 0) / 100} · meta mensal: R$ ${Number(settings.rows[0]?.goal ?? 0) / 100}`);
    console.log(`Fontes de bilhetes cadastradas: ${sources.rows[0]?.total}`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('\nFalhou:\n', error);
  process.exit(1);
});
