import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Carrega .env / .env.local sem depender de nenhum pacote externo.
 * Variáveis já presentes no ambiente têm prioridade (útil em CI e na Vercel).
 */
export function loadEnv(): void {
  for (const file of ['.env', '.env.local']) {
    const path = join(process.cwd(), file);
    if (!existsSync(path)) continue;

    for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
      const line = rawLine.trim();
      if (line === '' || line.startsWith('#')) continue;

      const separator = line.indexOf('=');
      if (separator === -1) continue;

      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
