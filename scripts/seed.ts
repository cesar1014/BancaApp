/**
 * Popula o banco com a banca inicial e as contas de acesso.
 *
 *   npm run db:seed              → banca + configurações + usuários iniciais
 *   npm run db:seed -- --demo    → adiciona entradas de exemplo
 *
 * O seed é idempotente: rodar de novo não duplica nada nem sobrescreve senhas.
 *
 * Contas criadas (todas com a senha padrão e troca obrigatória no 1º acesso):
 *   cesar1014  dono da banca (único que altera banca inicial e metas)
 *   ryang      administrador
 *   lucastqa   administrador
 */
import { Client } from 'pg';
import { loadEnv } from './env';
import { hashPassword } from '../src/lib/auth/password';
import { defaultUserPassword } from '../src/lib/auth/default-password';

const DEMO = process.argv.includes('--demo');

/** Configuração inicial pedida na especificação — tudo editável na interface. */
const INITIAL = {
  bankrollName: 'Banca Compartilhada',
  timezone: 'America/Sao_Paulo',
  initialBankrollCents: 500_000, // R$ 5.000,00
  monthlyGoalCents: 300_000, // R$ 3.000,00
  targetBankrollCents: 800_000, // R$ 8.000,00
  activeDays: 30,
  dailyGoalCents: 10_000, // R$ 100,00 (meta mensal ÷ 30 dias ativos)
  maxRiskPerEntryBps: 100, // 1%
  dailyStopBps: 300, // 3%
  weeklyStopBps: 600, // 6%
  monthlyStopBps: 1000, // 10%
};

interface SeedUser {
  username: string;
  name: string;
  isOwner: boolean;
  /** Participação inicial na banca, em bps. As três somam 100%. */
  shareBps: number;
}

/**
 * As três contas do grupo. E-mails são placeholders editáveis em Sócios →
 * Usuários; o login é pelo nick. Nomes e e-mails podem ser sobrescritos por
 * SEED_OWNER_NAME / SEED_OWNER_EMAIL para o dono.
 */
const USERS: readonly SeedUser[] = [
  { username: 'cesar1014', name: process.env.SEED_OWNER_NAME?.trim() || 'César', isOwner: true, shareBps: 3_334 },
  { username: 'ryang', name: 'Ryan', isOwner: false, shareBps: 3_333 },
  { username: 'lucastqa', name: 'Lucas', isOwner: false, shareBps: 3_333 },
];

async function main(): Promise<void> {
  loadEnv();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL não definida.');

  const password = defaultUserPassword();
  const ownerEmail = (process.env.SEED_OWNER_EMAIL?.trim() || 'cesar1014@banca.local').toLowerCase();

  const client = new Client({
    connectionString,
    ssl: /sslmode=require/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  try {
    await client.query('BEGIN');

    // -- Banca -------------------------------------------------------------
    let bankrollId: string;
    const existingBankroll = await client.query<{ id: string }>(
      'SELECT id FROM bankrolls ORDER BY created_at ASC LIMIT 1',
    );

    if (existingBankroll.rows[0]) {
      bankrollId = existingBankroll.rows[0].id;
      console.log('  ✓ banca já existente, mantida como está');
    } else {
      const inserted = await client.query<{ id: string }>(
        'INSERT INTO bankrolls (name, timezone) VALUES ($1, $2) RETURNING id',
        [INITIAL.bankrollName, INITIAL.timezone],
      );
      bankrollId = inserted.rows[0]!.id;
      console.log(`  → banca "${INITIAL.bankrollName}" criada`);
    }

    // -- Configurações -----------------------------------------------------
    await client.query(
      `INSERT INTO settings (
         bankroll_id, initial_bankroll_cents, monthly_goal_cents, target_bankroll_cents,
         active_days, daily_goal_mode, daily_goal_cents, risk_base, max_risk_per_entry_bps,
         max_stake_cap_cents, daily_stop_bps, weekly_stop_bps, monthly_stop_bps,
         stake_limit_policy, stop_limit_policy, partners_can_create_entries
       ) VALUES ($1,$2,$3,$4,$5,'AUTO',$6,'CURRENT',$7,NULL,$8,$9,$10,'BLOCK','WARN',TRUE)
       ON CONFLICT (bankroll_id) DO NOTHING`,
      [
        bankrollId,
        INITIAL.initialBankrollCents,
        INITIAL.monthlyGoalCents,
        INITIAL.targetBankrollCents,
        INITIAL.activeDays,
        INITIAL.dailyGoalCents,
        INITIAL.maxRiskPerEntryBps,
        INITIAL.dailyStopBps,
        INITIAL.weeklyStopBps,
        INITIAL.monthlyStopBps,
      ],
    );
    console.log('  → configurações iniciais garantidas');

    // -- Usuários ----------------------------------------------------------
    const hash = await hashPassword(password);
    const userIds = new Map<string, string>();
    let createdAny = false;

    for (const seedUser of USERS) {
      const email = seedUser.isOwner ? ownerEmail : `${seedUser.username}@banca.local`;
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM users WHERE lower(username) = lower($1)',
        [seedUser.username],
      );

      let userId: string;
      if (existing.rows[0]) {
        userId = existing.rows[0].id;
        // Garante o dono mesmo em bancos criados antes desta regra.
        if (seedUser.isOwner) {
          await client.query('UPDATE users SET is_owner = TRUE, role = $2 WHERE id = $1', [userId, 'ADMIN']);
        }
        console.log(`  ✓ usuário @${seedUser.username} já existe, senha preservada`);
      } else {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO users (name, email, username, password_hash, role, is_owner, must_change_password)
           VALUES ($1, $2, $3, $4, 'ADMIN', $5, TRUE)
           ON CONFLICT DO NOTHING RETURNING id`,
          [seedUser.name, email, seedUser.username, hash, seedUser.isOwner],
        );
        if (!inserted.rows[0]) {
          // Colisão de e-mail com uma conta antiga: vincula o nick a ela.
          const byEmail = await client.query<{ id: string }>(
            'SELECT id FROM users WHERE lower(btrim(email)) = $1',
            [email],
          );
          userId = byEmail.rows[0]!.id;
          await client.query(
            'UPDATE users SET username = $2, is_owner = $3, role = $4 WHERE id = $1',
            [userId, seedUser.username, seedUser.isOwner, 'ADMIN'],
          );
          console.log(`  → conta ${email} vinculada ao nick @${seedUser.username}`);
        } else {
          userId = inserted.rows[0].id;
          createdAny = true;
          console.log(`  → usuário @${seedUser.username} criado${seedUser.isOwner ? ' (dono)' : ''}`);
        }
      }
      userIds.set(seedUser.username, userId);

      // -- Sócio vinculado ao usuário ---------------------------------------
      const existingMember = await client.query<{ id: string }>(
        'SELECT id FROM members WHERE bankroll_id = $1 AND user_id = $2',
        [bankrollId, userId],
      );
      if (!existingMember.rows[0]) {
        const contribution = Math.round((INITIAL.initialBankrollCents * seedUser.shareBps) / 10_000);
        await client.query(
          `INSERT INTO members
             (bankroll_id, user_id, display_name, share_bps, initial_contribution_cents, joined_on)
           VALUES ($1,$2,$3,$4,$5, CURRENT_DATE)`,
          [bankrollId, userId, seedUser.name, seedUser.shareBps, contribution],
        );
        console.log(`  → sócio "${seedUser.name}" criado (${seedUser.shareBps / 100}%)`);
      }
    }

    // Um dono legado (admin@banca.local do seed antigo) perde a flag se não for o cesar1014.
    await client.query(
      "UPDATE users SET is_owner = FALSE WHERE is_owner = TRUE AND lower(username) IS DISTINCT FROM 'cesar1014'",
    );

    if (DEMO) await seedDemo(client, bankrollId, userIds.get('cesar1014')!);

    await client.query('COMMIT');

    console.log('\nSeed concluído.');
    console.log('  Usuários: cesar1014 (dono), ryang, lucastqa');
    if (createdAny) console.log(`  Senha padrão: ${password}`);
    console.log('\nNo primeiro acesso o sistema exige a troca da senha.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

/** Dados de demonstração: algumas entradas distribuídas entre os sócios. */
async function seedDemo(client: Client, bankrollId: string, adminId: string): Promise<void> {
  const already = await client.query<{ total: string }>(
    'SELECT count(*)::text AS total FROM entries WHERE bankroll_id = $1',
    [bankrollId],
  );
  if (Number(already.rows[0]?.total ?? 0) > 0) {
    console.log('  ✓ dados de demonstração já presentes');
    return;
  }

  const members = await client.query<{ id: string }>(
    'SELECT id FROM members WHERE bankroll_id = $1 ORDER BY created_at ASC',
    [bankrollId],
  );
  const memberIds = members.rows.map((row) => row.id);
  if (memberIds.length === 0) return;

  const samples: {
    dayOffset: number;
    sport: string;
    event: string;
    market: string;
    odd: number;
    stake: number;
    status: 'GREEN' | 'RED' | 'VOID' | 'CASHOUT' | 'OPEN';
    payout?: number;
  }[] = [
    { dayOffset: -6, sport: 'Futebol', event: 'Palmeiras x Santos', market: 'Over 1.5 gols', odd: 1720, stake: 5000, status: 'GREEN' },
    { dayOffset: -6, sport: 'Futebol', event: 'Flamengo x Vasco', market: 'Ambas marcam', odd: 1900, stake: 4500, status: 'RED' },
    { dayOffset: -5, sport: 'Basquete', event: 'Lakers x Celtics', market: 'Handicap -4.5', odd: 1880, stake: 5000, status: 'GREEN' },
    { dayOffset: -4, sport: 'Futebol', event: 'Grêmio x Internacional', market: 'Empate anula', odd: 2100, stake: 4000, status: 'VOID' },
    { dayOffset: -3, sport: 'Tênis', event: 'Alcaraz x Sinner', market: 'Vitória Alcaraz', odd: 2050, stake: 5000, status: 'CASHOUT', payout: 7200 },
    { dayOffset: -2, sport: 'Futebol', event: 'Corinthians x São Paulo', market: 'Under 2.5 gols', odd: 1650, stake: 4800, status: 'GREEN' },
    { dayOffset: -1, sport: 'Futebol', event: 'Atlético-MG x Cruzeiro', market: 'Escanteios +9.5', odd: 1950, stake: 4200, status: 'RED' },
    { dayOffset: 0, sport: 'Futebol', event: 'Bahia x Fortaleza', market: 'Casa vence', odd: 2250, stake: 5000, status: 'OPEN' },
  ];

  for (const [index, sample] of samples.entries()) {
    const memberId = memberIds[index % memberIds.length]!;
    const profit =
      sample.status === 'GREEN'
        ? Math.round((sample.stake * (sample.odd - 1000)) / 1000)
        : sample.status === 'RED'
          ? -sample.stake
          : sample.status === 'CASHOUT'
            ? (sample.payout ?? 0) - sample.stake
            : 0;
    const payout =
      sample.status === 'GREEN'
        ? sample.stake + profit
        : sample.status === 'VOID'
          ? sample.stake
          : sample.status === 'CASHOUT'
            ? (sample.payout ?? 0)
            : 0;

    await client.query(
      `INSERT INTO entries
         (bankroll_id, member_id, created_by_user_id, occurred_on, occurred_at_time,
          sport, event, market, odd_milli, stake_cents, status, payout_cents, profit_cents)
       VALUES ($1,$2,$3, CURRENT_DATE + ($4 || ' days')::interval, '20:30',
               $5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        bankrollId,
        memberId,
        adminId,
        String(sample.dayOffset),
        sample.sport,
        sample.event,
        sample.market,
        sample.odd,
        sample.stake,
        sample.status,
        payout,
        profit,
      ],
    );
  }

  await client.query(
    `INSERT INTO transactions (bankroll_id, member_id, created_by_user_id, kind, amount_cents, occurred_on, note)
     VALUES ($1, $2, $3, 'CONTRIBUTION', 50000, CURRENT_DATE - INTERVAL '3 days', 'Aporte de reforço')`,
    [bankrollId, memberIds[0], adminId],
  );

  console.log(`  → ${samples.length} entradas e 1 aporte de demonstração criados`);
}

main().catch((error: unknown) => {
  console.error('\nErro ao popular o banco:\n', error);
  process.exit(1);
});
