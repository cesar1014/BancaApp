-- ===========================================================================
-- 0001_init.sql — Estrutura inicial do sistema de banca esportiva
--
-- CONVENÇÕES DE PRECISÃO (nunca usar float para dinheiro):
--   *_cents  -> BIGINT, valor monetário em centavos     (R$ 50,00  = 5000)
--   *_milli  -> INTEGER, odd multiplicada por 1000      (odd 2,15  = 2150)
--   *_bps    -> INTEGER, percentual em basis points     (1%        = 100)
--                                                        (25%       = 2500)
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE user_role        AS ENUM ('ADMIN', 'PARTNER');
CREATE TYPE entry_status     AS ENUM ('OPEN', 'GREEN', 'RED', 'VOID', 'CASHOUT');
CREATE TYPE transaction_kind AS ENUM ('CONTRIBUTION', 'WITHDRAWAL');
CREATE TYPE risk_base        AS ENUM ('CURRENT', 'MONTH_START', 'INITIAL');
CREATE TYPE limit_policy     AS ENUM ('BLOCK', 'WARN');
CREATE TYPE goal_mode        AS ENUM ('AUTO', 'MANUAL');

-- ---------------------------------------------------------------------------
-- users — contas de acesso
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  email         TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  role          user_role   NOT NULL DEFAULT 'PARTNER',
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  -- incrementado ao desativar/trocar senha: invalida sessões emitidas antes
  token_version INTEGER     NOT NULL DEFAULT 1,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_unique_idx ON users (lower(btrim(email)));

-- ---------------------------------------------------------------------------
-- bankrolls — uma banca compartilhada (o sistema é multi-banca por desenho)
-- ---------------------------------------------------------------------------
CREATE TABLE bankrolls (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  timezone   TEXT        NOT NULL DEFAULT 'America/Sao_Paulo',
  currency   TEXT        NOT NULL DEFAULT 'BRL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- settings — parâmetros configuráveis da banca (1:1 com bankrolls)
-- Nenhum número de negócio fica fixo no código: tudo vem daqui.
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
  bankroll_id             UUID PRIMARY KEY REFERENCES bankrolls(id) ON DELETE CASCADE,

  -- Metas
  initial_bankroll_cents  BIGINT      NOT NULL CHECK (initial_bankroll_cents >= 0),
  monthly_goal_cents      BIGINT      NOT NULL CHECK (monthly_goal_cents >= 0),
  target_bankroll_cents   BIGINT      NOT NULL CHECK (target_bankroll_cents >= 0),
  active_days             INTEGER     NOT NULL CHECK (active_days BETWEEN 1 AND 31),
  daily_goal_mode         goal_mode   NOT NULL DEFAULT 'AUTO',
  daily_goal_cents        BIGINT      NOT NULL DEFAULT 0 CHECK (daily_goal_cents >= 0),

  -- Risco
  risk_base               risk_base   NOT NULL DEFAULT 'CURRENT',
  max_risk_per_entry_bps  INTEGER     NOT NULL CHECK (max_risk_per_entry_bps BETWEEN 1 AND 10000),
  max_stake_cap_cents     BIGINT      CHECK (max_stake_cap_cents IS NULL OR max_stake_cap_cents > 0),
  daily_stop_bps          INTEGER     NOT NULL CHECK (daily_stop_bps BETWEEN 1 AND 10000),
  weekly_stop_bps         INTEGER     NOT NULL CHECK (weekly_stop_bps BETWEEN 1 AND 10000),
  monthly_stop_bps        INTEGER     NOT NULL CHECK (monthly_stop_bps BETWEEN 1 AND 10000),

  -- Políticas: BLOCK impede o registro, WARN apenas alerta e exige confirmação
  stake_limit_policy      limit_policy NOT NULL DEFAULT 'BLOCK',
  stop_limit_policy       limit_policy NOT NULL DEFAULT 'WARN',

  -- Quem pode registrar entradas além do administrador
  partners_can_create_entries BOOLEAN NOT NULL DEFAULT TRUE,

  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_user_id      UUID REFERENCES users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- members — sócios da banca (vinculados ou não a um usuário de login)
-- ---------------------------------------------------------------------------
CREATE TABLE members (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bankroll_id                UUID NOT NULL REFERENCES bankrolls(id) ON DELETE CASCADE,
  user_id                    UUID REFERENCES users(id) ON DELETE SET NULL,
  display_name               TEXT NOT NULL CHECK (length(btrim(display_name)) BETWEEN 2 AND 120),
  share_bps                  INTEGER NOT NULL DEFAULT 0 CHECK (share_bps BETWEEN 0 AND 10000),
  initial_contribution_cents BIGINT  NOT NULL DEFAULT 0 CHECK (initial_contribution_cents >= 0),
  can_create_entries         BOOLEAN NOT NULL DEFAULT TRUE,
  is_active                  BOOLEAN NOT NULL DEFAULT TRUE,
  joined_on                  DATE    NOT NULL DEFAULT CURRENT_DATE,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX members_bankroll_user_unique_idx
  ON members (bankroll_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX members_bankroll_idx ON members (bankroll_id);

-- ---------------------------------------------------------------------------
-- entries — apostas registradas
--
-- profit_cents e payout_cents são SEMPRE recalculados no servidor a partir de
-- (stake, odd, status, payout informado no cashout). O frontend nunca envia
-- lucro. O CHECK abaixo é a última linha de defesa no banco.
-- ---------------------------------------------------------------------------
CREATE TABLE entries (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bankroll_id            UUID NOT NULL REFERENCES bankrolls(id) ON DELETE CASCADE,
  member_id              UUID NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  created_by_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,

  occurred_on            DATE NOT NULL,
  occurred_at_time       TIME NOT NULL DEFAULT '12:00',

  sport                  TEXT NOT NULL CHECK (length(btrim(sport)) BETWEEN 1 AND 60),
  event                  TEXT NOT NULL CHECK (length(btrim(event)) BETWEEN 1 AND 200),
  market                 TEXT NOT NULL CHECK (length(btrim(market)) BETWEEN 1 AND 200),

  odd_milli              INTEGER NOT NULL CHECK (odd_milli BETWEEN 1001 AND 10000000),
  stake_cents            BIGINT  NOT NULL CHECK (stake_cents > 0),
  status                 entry_status NOT NULL DEFAULT 'OPEN',
  payout_cents           BIGINT  NOT NULL DEFAULT 0 CHECK (payout_cents >= 0),
  profit_cents           BIGINT  NOT NULL DEFAULT 0,

  note                   TEXT CHECK (note IS NULL OR length(note) <= 1000),
  risk_override          BOOLEAN NOT NULL DEFAULT FALSE,
  risk_override_reason   TEXT CHECK (risk_override_reason IS NULL OR length(risk_override_reason) <= 300),

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Coerência entre status, retorno e lucro (mesma regra do domínio em TS)
  CONSTRAINT entries_result_consistency CHECK (
    (status = 'OPEN'    AND payout_cents = 0            AND profit_cents = 0) OR
    (status = 'RED'     AND payout_cents = 0            AND profit_cents = -stake_cents) OR
    (status = 'VOID'    AND payout_cents = stake_cents  AND profit_cents = 0) OR
    (status = 'GREEN'   AND payout_cents = stake_cents + profit_cents AND profit_cents >= 0) OR
    (status = 'CASHOUT' AND profit_cents = payout_cents - stake_cents)
  )
);

CREATE INDEX entries_bankroll_date_idx   ON entries (bankroll_id, occurred_on DESC, occurred_at_time DESC);
CREATE INDEX entries_bankroll_status_idx ON entries (bankroll_id, status);
CREATE INDEX entries_member_idx          ON entries (member_id);

-- ---------------------------------------------------------------------------
-- transactions — aportes e retiradas
--
-- IMPORTANTE: movimentam a banca mas NUNCA entram no lucro/prejuízo das
-- entradas nem no ROI. São tratadas em coluna separada em toda agregação.
-- ---------------------------------------------------------------------------
CREATE TABLE transactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bankroll_id        UUID NOT NULL REFERENCES bankrolls(id) ON DELETE CASCADE,
  member_id          UUID REFERENCES members(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  kind               transaction_kind NOT NULL,
  amount_cents       BIGINT NOT NULL CHECK (amount_cents > 0),
  occurred_on        DATE   NOT NULL,
  note               TEXT CHECK (note IS NULL OR length(note) <= 1000),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX transactions_bankroll_date_idx ON transactions (bankroll_id, occurred_on DESC);
CREATE INDEX transactions_member_idx        ON transactions (member_id);

-- ---------------------------------------------------------------------------
-- monthly_goals — meta específica de um mês (sobrepõe settings naquele mês)
-- ---------------------------------------------------------------------------
CREATE TABLE monthly_goals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bankroll_id           UUID NOT NULL REFERENCES bankrolls(id) ON DELETE CASCADE,
  year                  INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2200),
  month                 INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  goal_cents            BIGINT  NOT NULL CHECK (goal_cents >= 0),
  active_days           INTEGER NOT NULL CHECK (active_days BETWEEN 1 AND 31),
  daily_goal_cents      BIGINT  NOT NULL CHECK (daily_goal_cents >= 0),
  target_bankroll_cents BIGINT  NOT NULL CHECK (target_bankroll_cents >= 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bankroll_id, year, month)
);

-- ---------------------------------------------------------------------------
-- monthly_closings — fotografia imutável do mês fechado
-- Mudanças futuras em settings não alteram meses já fechados.
-- ---------------------------------------------------------------------------
CREATE TABLE monthly_closings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bankroll_id             UUID NOT NULL REFERENCES bankrolls(id) ON DELETE CASCADE,
  year                    INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2200),
  month                   INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),

  opening_bankroll_cents  BIGINT  NOT NULL,
  entries_profit_cents    BIGINT  NOT NULL,
  contributions_cents     BIGINT  NOT NULL,
  withdrawals_cents       BIGINT  NOT NULL,
  closing_bankroll_cents  BIGINT  NOT NULL,

  goal_cents              BIGINT  NOT NULL,
  goal_progress_bps       INTEGER NOT NULL,
  roi_bps                 INTEGER NOT NULL,

  entries_count           INTEGER NOT NULL,
  greens                  INTEGER NOT NULL,
  reds                    INTEGER NOT NULL,
  voids                   INTEGER NOT NULL,
  cashouts                INTEGER NOT NULL,
  open_entries            INTEGER NOT NULL DEFAULT 0,
  hit_rate_bps            INTEGER NOT NULL,
  total_staked_cents      BIGINT  NOT NULL,
  max_stake_cents         BIGINT  NOT NULL,

  snapshot                JSONB   NOT NULL,

  closed_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (bankroll_id, year, month)
);

CREATE INDEX monthly_closings_bankroll_period_idx
  ON monthly_closings (bankroll_id, year DESC, month DESC);

-- ---------------------------------------------------------------------------
-- monthly_closing_partners — resultado de cada sócio no mês fechado
-- ---------------------------------------------------------------------------
CREATE TABLE monthly_closing_partners (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_id          UUID NOT NULL REFERENCES monthly_closings(id) ON DELETE CASCADE,
  member_id           UUID REFERENCES members(id) ON DELETE SET NULL,
  display_name        TEXT    NOT NULL,
  share_bps           INTEGER NOT NULL,
  profit_share_cents  BIGINT  NOT NULL,
  contributions_cents BIGINT  NOT NULL,
  withdrawals_cents   BIGINT  NOT NULL,
  balance_cents       BIGINT  NOT NULL
);

CREATE INDEX monthly_closing_partners_closing_idx ON monthly_closing_partners (closing_id);

-- ---------------------------------------------------------------------------
-- audit_logs — trilha de auditoria de tudo que importa
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bankroll_id UUID REFERENCES bankrolls(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name   TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   UUID,
  description TEXT NOT NULL,
  old_values  JSONB,
  new_values  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_bankroll_created_idx ON audit_logs (bankroll_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx           ON audit_logs (entity, entity_id);

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
-- clock_timestamp() (e não now()) para que updated_at avance mesmo quando
-- várias escritas acontecem dentro da mesma transação.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at         BEFORE UPDATE ON users         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER bankrolls_set_updated_at     BEFORE UPDATE ON bankrolls     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER settings_set_updated_at      BEFORE UPDATE ON settings      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER members_set_updated_at       BEFORE UPDATE ON members       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER entries_set_updated_at       BEFORE UPDATE ON entries       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER transactions_set_updated_at  BEFORE UPDATE ON transactions  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER monthly_goals_set_updated_at BEFORE UPDATE ON monthly_goals FOR EACH ROW EXECUTE FUNCTION set_updated_at();
