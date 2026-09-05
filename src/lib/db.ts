import 'server-only';
import { Pool, types, type PoolClient, type QueryResultRow } from 'pg';
import { databaseUrl } from './env';

/**
 * Conexão PostgreSQL.
 *
 * Dois parsers de tipo são registrados globalmente e são essenciais para a
 * precisão do sistema:
 *   - int8 (BIGINT): o driver devolve string por padrão; convertemos para
 *     Number porque todos os nossos BIGINT são centavos, muito abaixo de 2^53.
 *   - date (DATE): o driver devolve um objeto Date no fuso local, o que
 *     desloca o dia; mantemos a string 'AAAA-MM-DD' exatamente como no banco.
 */
types.setTypeParser(types.builtins.INT8, (value: string) => Number.parseInt(value, 10));
types.setTypeParser(types.builtins.DATE, (value: string) => value);
types.setTypeParser(types.builtins.NUMERIC, (value: string) => Number.parseFloat(value));

declare global {
  // eslint-disable-next-line no-var
  var __bancaPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = databaseUrl();
  const needsSsl =
    /sslmode=require/.test(connectionString) ||
    (process.env.NODE_ENV === 'production' && !/localhost|127\.0\.0\.1/.test(connectionString));

  return new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
}

export function getPool(): Pool {
  if (!globalThis.__bancaPool) {
    globalThis.__bancaPool = createPool();
    globalThis.__bancaPool.on('error', (error) => {
      console.error('[db] erro inesperado no pool de conexões', error);
    });
  }
  return globalThis.__bancaPool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params as unknown[]);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Executa uma função dentro de uma transação, com rollback automático. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* conexão já perdida — nada a fazer */
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Erro de violação de unicidade do Postgres. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
