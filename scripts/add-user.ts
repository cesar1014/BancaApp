/**
 * Cria uma conta de acesso nova.
 *
 *   npm run user:add -- <nick> "<Nome exibido>" [--admin] [--share=<%>]
 *
 * Exemplos:
 *   npm run user:add -- ryanp "Ryan P"
 *   npm run user:add -- joao "João" --admin
 *   npm run user:add -- ana "Ana" --share=10
 *
 * O que faz:
 *   - cria o usuário com a SENHA PADRÃO (DEFAULT_USER_PASSWORD) e troca
 *     obrigatória no primeiro acesso — ninguém vê uma senha escolhida por
 *     outra pessoa;
 *   - cria o sócio vinculado, com 0% de participação por padrão. Zero por
 *     cento é proposital: quem entra só para acompanhar e registrar entradas
 *     não altera o rateio de lucro de quem pôs dinheiro. Sem o sócio
 *     vinculado, a tela de entradas recusaria o acesso;
 *   - recusa nick ou e-mail repetido, em vez de sobrescrever conta existente.
 *
 * Participação acima de zero exige tirar de alguém: o total precisa fechar em
 * 100%. O script avisa e não faz esse ajuste sozinho — dividir banca é decisão
 * de gente, não de script.
 */
import { Client } from 'pg';
import { loadEnv } from './env';
import { hashPassword } from '../src/lib/auth/password';
import { defaultUserPassword } from '../src/lib/auth/default-password';

const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;

interface Options {
  username: string;
  name: string;
  admin: boolean;
  shareBps: number;
}

function parseArgs(argv: readonly string[]): Options {
  const positional: string[] = [];
  let admin = false;
  let shareBps = 0;

  for (const arg of argv) {
    if (arg === '--admin') {
      admin = true;
    } else if (arg.startsWith('--share=')) {
      const percent = Number(arg.slice('--share='.length).replace(',', '.'));
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        throw new Error('--share precisa ser um número entre 0 e 100.');
      }
      shareBps = Math.round(percent * 100);
    } else {
      positional.push(arg);
    }
  }

  const [username, name] = positional;
  if (!username || !name) {
    throw new Error('Uso: npm run user:add -- <nick> "<Nome exibido>" [--admin] [--share=<%>]');
  }
  if (!USERNAME_RE.test(username)) {
    throw new Error('O nick precisa ter de 3 a 32 letras, números, ponto, hífen ou sublinhado.');
  }
  if (name.trim().length < 2 || name.trim().length > 120) {
    throw new Error('O nome exibido precisa ter de 2 a 120 caracteres.');
  }

  return { username, name: name.trim(), admin, shareBps };
}

async function main(): Promise<void> {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL não definida.');

  const email = `${options.username.toLowerCase()}@banca.local`;
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query('BEGIN');

    const clash = await client.query<{ username: string | null; email: string }>(
      'SELECT username, email FROM users WHERE lower(username) = lower($1) OR lower(btrim(email)) = $2',
      [options.username, email],
    );
    if (clash.rows[0]) {
      const row = clash.rows[0];
      throw new Error(
        row.username && row.username.toLowerCase() === options.username.toLowerCase()
          ? `Já existe uma conta com o nick @${row.username}. Escolha outro nick.`
          : `Já existe uma conta com o e-mail ${row.email}.`,
      );
    }

    const bankroll = await client.query<{ id: string; name: string }>(
      'SELECT id, name FROM bankrolls ORDER BY created_at LIMIT 1',
    );
    const bankrollId = bankroll.rows[0]?.id;
    if (!bankrollId) throw new Error('Nenhuma banca encontrada. Rode `npm run db:setup` antes.');

    const password = defaultUserPassword();
    const passwordHash = await hashPassword(password);

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO users (name, email, username, password_hash, role, is_owner, must_change_password)
       VALUES ($1, $2, $3, $4, $5, FALSE, TRUE)
       RETURNING id`,
      [options.name, email, options.username, passwordHash, options.admin ? 'ADMIN' : 'PARTNER'],
    );
    const userId = inserted.rows[0]!.id;

    await client.query(
      `INSERT INTO members
         (bankroll_id, user_id, display_name, share_bps, initial_contribution_cents,
          can_create_entries, is_active, joined_on)
       VALUES ($1, $2, $3, $4, 0, TRUE, TRUE, CURRENT_DATE)`,
      [bankrollId, userId, options.name, options.shareBps],
    );

    const total = await client.query<{ soma: number }>(
      'SELECT COALESCE(SUM(share_bps), 0)::int AS soma FROM members WHERE bankroll_id = $1 AND is_active',
      [bankrollId],
    );
    const somaBps = total.rows[0]?.soma ?? 0;

    await client.query('COMMIT');

    console.log(`\nConta criada em "${bankroll.rows[0]!.name}".`);
    console.log(`  nick     @${options.username}`);
    console.log(`  nome     ${options.name}`);
    console.log(`  e-mail   ${email}`);
    console.log(`  acesso   ${options.admin ? 'administrador' : 'sócio'}`);
    console.log(`  banca    ${options.shareBps / 100}% de participação`);
    console.log(`\n  Senha inicial: ${password}`);
    console.log('  No primeiro acesso o sistema exige a troca da senha.');

    if (somaBps !== 10_000) {
      console.log(
        `\n  ATENÇÃO: as participações somam ${somaBps / 100}%, não 100%. ` +
          'Ajuste em Sócios antes do próximo fechamento, senão o rateio de lucro sai errado.',
      );
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
