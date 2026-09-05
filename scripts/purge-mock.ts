/**
 * Remove do banco as partidas geradas pelo simulador.
 *
 *   npx tsx scripts/purge-mock.ts
 *
 * Serve para limpar um banco real que recebeu dado de simulação — o que
 * acontece quando a aplicação sobe sem DATA_PROVIDER_MODE definido e cai no
 * padrão "mock". Apaga só o que veio exclusivamente do simulador: partida
 * que também tenha id de provedor real permanece.
 */
import { Client } from 'pg';
import { loadEnv } from './env';

async function main(): Promise<void> {
  loadEnv();
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query('BEGIN');
    const cond = `provider_ids ? 'mock' AND NOT (provider_ids ?| array['api-football','sportmonks','odds-api'])`;

    const antes = await c.query(`SELECT count(*)::int n FROM sport_fixtures WHERE ${cond}`);
    const tips = await c.query(
      `DELETE FROM bet_tips WHERE fixture_id IN (SELECT id FROM sport_fixtures WHERE ${cond})`,
    );
    const fixtures = await c.query(`DELETE FROM sport_fixtures WHERE ${cond}`);
    await c.query('COMMIT');

    console.log(`partidas simuladas encontradas: ${antes.rows[0].n}`);
    console.log(`  dicas removidas   : ${tips.rowCount}`);
    console.log(`  partidas removidas: ${fixtures.rowCount}`);

    const resto = await c.query(
      `SELECT jsonb_object_keys(provider_ids) prov, count(*)::int n FROM sport_fixtures GROUP BY 1 ORDER BY 2 DESC`,
    );
    console.log('\nsobrou no banco:');
    for (const r of resto.rows) console.log(`  ${String(r.prov).padEnd(16)}${r.n}`);
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  } finally {
    await c.end();
  }
}
main().catch((e: unknown) => { console.error(e); process.exit(1); });
