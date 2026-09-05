/**
 * Executa as migrations SQL de db/migrations em ordem alfabética.
 * Cada arquivo roda uma única vez e fica registrado em schema_migrations.
 *
 *   npm run db:migrate
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { loadEnv } from './env';

const MIGRATIONS_DIR = join(process.cwd(), 'db', 'migrations');

async function main(): Promise<void> {
  loadEnv();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL não definida. Copie .env.example para .env.');
  }

  const client = new Client({
    connectionString,
    ssl: /sslmode=require/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const applied = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(
        (row) => row.name,
      ),
    );

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    let executed = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  ✓ ${file} (já aplicada)`);
        continue;
      }

      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      process.stdout.write(`  → aplicando ${file} ... `);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        executed += 1;
        console.log('ok');
      } catch (error) {
        await client.query('ROLLBACK');
        console.log('FALHOU');
        throw error;
      }
    }

    console.log(
      executed === 0
        ? '\nBanco já está atualizado.'
        : `\n${executed} migration(s) aplicada(s) com sucesso.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('\nErro ao aplicar migrations:\n', error);
  process.exit(1);
});
