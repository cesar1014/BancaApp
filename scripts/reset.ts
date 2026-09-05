/**
 * Apaga todo o schema e reaplica as migrations. DESTRUTIVO.
 *
 *   npm run db:reset
 */
import { createInterface } from 'node:readline/promises';
import { Client } from 'pg';
import { loadEnv } from './env';

async function main(): Promise<void> {
  loadEnv();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL não definida.');

  if (!process.argv.includes('--yes')) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      'Isto vai APAGAR todos os dados do banco. Digite "apagar" para confirmar: ',
    );
    rl.close();
    if (answer.trim().toLowerCase() !== 'apagar') {
      console.log('Cancelado.');
      return;
    }
  }

  const client = new Client({
    connectionString,
    ssl: /sslmode=require/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('Schema recriado. Rode: npm run db:migrate && npm run db:seed');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
