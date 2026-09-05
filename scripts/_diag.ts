import { Client } from 'pg';
import { loadEnv } from './env';
async function main(): Promise<void> {
  loadEnv();
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const l = await c.query(`select
      count(*)::int total,
      count(fixture_id)::int casadas,
      count(*) filter (where market_key is not null)::int com_mercado,
      count(*) filter (where fixture_id is not null and market_key is not null)::int utilizaveis
    from tip_slip_legs`);
  console.log('=== PERNAS DE BILHETE ===');
  console.log('  total ' + l.rows[0].total + ' | casadas com partida ' + l.rows[0].casadas +
    ' | com mercado interpretado ' + l.rows[0].com_mercado + ' | utilizaveis p/ cruzar ' + l.rows[0].utilizaveis);

  const s = await c.query(`select s.source_slug, count(*)::int pernas,
      count(g.fixture_id)::int casadas
    from tip_slip_legs g join tip_slips s on s.id = g.slip_id
    group by 1 order by 2 desc`);
  console.log('\n  por fonte:');
  for (const r of s.rows) console.log('    ' + String(r.source_slug).padEnd(20) + r.pernas + ' pernas, ' + r.casadas + ' casadas');

  const t = await c.query(`select count(*)::int n, count(distinct fixture_id)::int jogos from bet_tips`);
  console.log('\n=== DICAS DO MODELO ===');
  console.log('  ' + t.rows[0].n + ' dicas em ' + t.rows[0].jogos + ' partidas');

  const cruz = await c.query(`
    select f.home_name || ' x ' || f.away_name jogo, g.market_key, g.selection_key, g.line_milli,
           count(distinct s.source_slug)::int fontes,
           string_agg(distinct s.source_slug, ', ') quais
    from tip_slip_legs g
    join tip_slips s on s.id = g.slip_id
    join sport_fixtures f on f.id = g.fixture_id
    where g.market_key is not null
    group by 1,2,3,4
    having count(distinct s.source_slug) > 1
    order by 5 desc limit 10`);
  console.log('\n=== ONDE DUAS OU MAIS FONTES CONCORDAM ===');
  if (cruz.rows.length === 0) console.log('  (nenhum ainda)');
  for (const r of cruz.rows) {
    console.log('  ' + String(r.fontes) + ' fontes  ' + r.jogo.padEnd(34).slice(0,34) + '  ' +
      r.market_key + '/' + r.selection_key + (r.line_milli ? ' ' + r.line_milli/1000 : '') + '   [' + r.quais + ']');
  }
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
