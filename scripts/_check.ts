import { Client } from 'pg';
import { loadEnv } from './env';
async function main(): Promise<void> {
  loadEnv();
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const agora = Date.now();
  const min = (d: Date | null) => (d ? Math.round((agora - new Date(d).getTime()) / 60000) + ' min atras' : 'nunca');

  const j = await c.query(`select job, last_run_at, last_status, last_message, runs from sports_jobs order by last_run_at desc nulls last`);
  console.log('=== ROTINAS ===');
  for (const r of j.rows) {
    console.log('  ' + String(r.job).padEnd(12) + String(r.last_status).padEnd(9) + min(r.last_run_at).padEnd(15) +
      '(' + r.runs + ' execucoes)  ' + String(r.last_message ?? '').slice(0, 55));
  }

  const f = await c.query(`select max(last_refreshed_at) ult,
      count(*) filter (where last_refreshed_at > now() - interval '15 minutes')::int recentes,
      count(*) filter (where status in ('LIVE','HALFTIME'))::int vivos from sport_fixtures`);
  console.log('\n=== DADOS ===');
  console.log('  ultima atualizacao: ' + min(f.rows[0].ult));
  console.log('  partidas tocadas nos ultimos 15 min: ' + f.rows[0].recentes);
  console.log('  ao vivo agora: ' + f.rows[0].vivos);

  const v = await c.query(`select home_name h, away_name a, status, minute, home_score sh, away_score sa, last_refreshed_at
    from sport_fixtures where status in ('LIVE','HALFTIME') order by start_time`);
  for (const x of v.rows) {
    console.log('    ' + (x.h + ' x ' + x.a).padEnd(32).slice(0,32) + String(x.status).padEnd(10) +
      String(x.minute ?? '-').padStart(4) + "'  " + x.sh + 'x' + x.sa + '   ' + min(x.last_refreshed_at));
  }

  const sp = await c.query(`select home_name h, away_name a, status, home_score sh, away_score sa
    from sport_fixtures where home_name ilike '%Sao Paulo%' or away_name ilike '%Sao Paulo%'
    order by start_time desc limit 2`);
  console.log('\n=== SAO PAULO ===');
  for (const x of sp.rows) console.log('    ' + x.h + ' x ' + x.a + '  ' + x.status + '  ' + x.sh + ' x ' + x.sa);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
