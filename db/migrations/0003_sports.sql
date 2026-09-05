-- ===========================================================================
-- 0003_sports.sql — Central de Dicas: dados esportivos, dicas e provedores
--
-- CONVENÇÕES (as mesmas do restante do sistema):
--   *_cents  BIGINT   dinheiro em centavos
--   *_milli  INTEGER  odds, xG e linhas × 1000 (odd 1,58 = 1580; linha 2,5 = 2500)
--   *_bps    INTEGER  percentuais em basis points (76% = 7600)
--   score    INTEGER  0–100
--
-- As partidas usam chave TEXT determinística (data:mandante:visitante) para
-- que o mesmo jogo vindo de provedores diferentes caia na mesma linha.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- sport_leagues — competições vistas (catálogo em código + descobertas)
-- ---------------------------------------------------------------------------
CREATE TABLE sport_leagues (
  key          TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  country      TEXT NOT NULL DEFAULT '',
  season       INTEGER,
  priority     INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 9),
  provider_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- sport_teams — clubes com aliases persistidos (índice do matching)
-- ---------------------------------------------------------------------------
CREATE TABLE sport_teams (
  key          TEXT PRIMARY KEY,           -- chave canônica ("manchester united")
  name         TEXT NOT NULL,
  country      TEXT,
  aliases      TEXT[] NOT NULL DEFAULT '{}',
  provider_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- sport_fixtures — partidas normalizadas + estado da análise
-- payload guarda o NormalizedFixture completo (estatísticas, eventos, odds,
-- metadados de confiança); as colunas soltas existem para filtrar e ordenar.
-- ---------------------------------------------------------------------------
CREATE TABLE sport_fixtures (
  id                TEXT PRIMARY KEY,
  league_key        TEXT NOT NULL,
  league_name       TEXT NOT NULL,
  league_country    TEXT NOT NULL DEFAULT '',
  home_key          TEXT NOT NULL,
  home_name         TEXT NOT NULL,
  away_key          TEXT NOT NULL,
  away_name         TEXT NOT NULL,
  start_time        TIMESTAMPTZ NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('SCHEDULED','LIVE','HALFTIME','FINISHED','POSTPONED','CANCELLED','UNKNOWN')),
  minute            INTEGER CHECK (minute IS NULL OR minute BETWEEN 0 AND 130),
  home_score        INTEGER NOT NULL DEFAULT 0 CHECK (home_score >= 0),
  away_score        INTEGER NOT NULL DEFAULT 0 CHECK (away_score >= 0),
  provider_ids      JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload           JSONB NOT NULL,

  -- Análise
  analysis_state    TEXT NOT NULL DEFAULT 'OBSERVANDO',
  live_state        TEXT NOT NULL DEFAULT 'NORMAL',
  funnel_tier       TEXT NOT NULL DEFAULT 'IGNORED' CHECK (funnel_tier IN ('IGNORED','INTERESTING','MONITORED','ADVANCED')),
  interest_score    INTEGER NOT NULL DEFAULT 0 CHECK (interest_score BETWEEN 0 AND 100),
  best_score        INTEGER NOT NULL DEFAULT 0 CHECK (best_score BETWEEN 0 AND 100),
  strategy_states   JSONB NOT NULL DEFAULT '{}'::jsonb,
  evaluation        JSONB,
  has_odds          BOOLEAN NOT NULL DEFAULT FALSE,
  data_stale        BOOLEAN NOT NULL DEFAULT FALSE,

  last_refreshed_at TIMESTAMPTZ,
  last_evaluated_at TIMESTAMPTZ,
  last_snapshot_minute INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sport_fixtures_start_idx   ON sport_fixtures (start_time);
CREATE INDEX sport_fixtures_status_idx  ON sport_fixtures (status, start_time);
CREATE INDEX sport_fixtures_league_idx  ON sport_fixtures (league_key, start_time);
CREATE INDEX sport_fixtures_state_idx   ON sport_fixtures (analysis_state) WHERE status IN ('LIVE','HALFTIME');

-- ---------------------------------------------------------------------------
-- provider_mapping — "o id X do provedor P é a nossa entidade Y"
-- Calculado uma vez pelo matching e reaproveitado depois.
-- ---------------------------------------------------------------------------
CREATE TABLE provider_mapping (
  provider       TEXT NOT NULL,
  entity_type    TEXT NOT NULL CHECK (entity_type IN ('fixture','team','league')),
  provider_id    TEXT NOT NULL,
  internal_id    TEXT NOT NULL,
  confidence_bps INTEGER NOT NULL DEFAULT 10000 CHECK (confidence_bps BETWEEN 0 AND 10000),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, entity_type, provider_id)
);

CREATE INDEX provider_mapping_internal_idx ON provider_mapping (entity_type, internal_id, provider);

-- ---------------------------------------------------------------------------
-- live_snapshots — fotografias da partida ao vivo (a cada N minutos)
-- Base para backtesting e para comparar antes/depois da dica.
-- ---------------------------------------------------------------------------
CREATE TABLE live_snapshots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id     TEXT NOT NULL REFERENCES sport_fixtures(id) ON DELETE CASCADE,
  minute         INTEGER NOT NULL CHECK (minute BETWEEN 0 AND 130),
  home_score     INTEGER NOT NULL,
  away_score     INTEGER NOT NULL,
  statistics     JSONB,
  quotes         JSONB,
  best_score     INTEGER NOT NULL DEFAULT 0,
  analysis_state TEXT NOT NULL DEFAULT 'OBSERVANDO',
  captured_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fixture_id, minute)
);

CREATE INDEX live_snapshots_fixture_idx ON live_snapshots (fixture_id, minute);

-- ---------------------------------------------------------------------------
-- odds_snapshots — histórico de cotações (movimento da odd)
-- ---------------------------------------------------------------------------
CREATE TABLE odds_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id  TEXT NOT NULL REFERENCES sport_fixtures(id) ON DELETE CASCADE,
  market_key  TEXT NOT NULL,
  selection   TEXT NOT NULL,
  line_milli  INTEGER,
  bookmaker   TEXT NOT NULL,
  odd_milli   INTEGER NOT NULL CHECK (odd_milli > 1000),
  provider    TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX odds_snapshots_fixture_idx ON odds_snapshots (fixture_id, market_key, captured_at DESC);

-- ---------------------------------------------------------------------------
-- bet_strategies — sobrescritas de configuração por estratégia (opcional)
-- A configuração padrão vive em código (config/strategy-config.ts); aqui só
-- entram ajustes feitos em runtime, mesclados por cima.
-- ---------------------------------------------------------------------------
CREATE TABLE bet_strategies (
  key        TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  market_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- bet_tips — toda dica gerada, com o contexto do momento e o resultado
-- ---------------------------------------------------------------------------
CREATE TABLE bet_tips (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id       TEXT NOT NULL REFERENCES sport_fixtures(id) ON DELETE CASCADE,
  strategy_key     TEXT NOT NULL,
  market_key       TEXT NOT NULL,
  selection        TEXT NOT NULL,
  line_milli       INTEGER,

  odd_milli        INTEGER NOT NULL CHECK (odd_milli > 1000),
  min_odd_milli    INTEGER NOT NULL DEFAULT 0,
  fair_odd_milli   INTEGER NOT NULL,
  probability_bps  INTEGER NOT NULL CHECK (probability_bps BETWEEN 0 AND 10000),
  value_bps        INTEGER NOT NULL,
  ev_bps           INTEGER NOT NULL,
  score            INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  breakdown        JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence       TEXT NOT NULL CHECK (confidence IN ('BAIXA','MEDIA','ALTA')),
  rationale        TEXT NOT NULL DEFAULT '',
  state            TEXT NOT NULL DEFAULT 'ENTRADA_IDENTIFICADA',
  status           TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SETTLED','EXPIRED','DISCARDED')),

  bookmaker        TEXT,
  odds_captured_at TIMESTAMPTZ,
  minute_at        INTEGER,
  home_score_at    INTEGER NOT NULL DEFAULT 0,
  away_score_at    INTEGER NOT NULL DEFAULT 0,
  stats_at         JSONB,

  result           TEXT CHECK (result IS NULL OR result IN ('GREEN','RED','PUSH')),
  stake_cents      BIGINT NOT NULL DEFAULT 10000 CHECK (stake_cents > 0),
  payout_cents     BIGINT NOT NULL DEFAULT 0 CHECK (payout_cents >= 0),
  profit_cents     BIGINT NOT NULL DEFAULT 0,
  entry_id         UUID REFERENCES entries(id) ON DELETE SET NULL,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at       TIMESTAMPTZ,

  UNIQUE (fixture_id, strategy_key, selection),
  -- Mesma coerência das entradas: resultado, retorno e lucro batem entre si.
  CONSTRAINT bet_tips_result_consistency CHECK (
    (result IS NULL  AND payout_cents = 0 AND profit_cents = 0) OR
    (result = 'RED'  AND payout_cents = 0 AND profit_cents = -stake_cents) OR
    (result = 'PUSH' AND payout_cents = stake_cents AND profit_cents = 0) OR
    (result = 'GREEN' AND payout_cents = stake_cents + profit_cents AND profit_cents >= 0)
  )
);

CREATE INDEX bet_tips_status_idx  ON bet_tips (status, created_at DESC);
CREATE INDEX bet_tips_fixture_idx ON bet_tips (fixture_id);
CREATE INDEX bet_tips_created_idx ON bet_tips (created_at DESC);

-- ---------------------------------------------------------------------------
-- provider_usage — consumo de quota por provedor (persistido para serverless)
-- ---------------------------------------------------------------------------
CREATE TABLE provider_usage (
  provider          TEXT PRIMARY KEY,
  requests_used     INTEGER NOT NULL DEFAULT 0,
  request_limit     INTEGER,
  remaining         INTEGER,
  reset_at          TIMESTAMPTZ,
  last_request_at   TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'OK',
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recent            JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- sports_cache — camada persistente do cache (sobrevive ao cold start)
-- ---------------------------------------------------------------------------
CREATE TABLE sports_cache (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  stored_at  TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX sports_cache_expires_idx ON sports_cache (expires_at);

-- ---------------------------------------------------------------------------
-- sports_jobs — última execução de cada rotina (cooldown entre instâncias)
-- ---------------------------------------------------------------------------
CREATE TABLE sports_jobs (
  job          TEXT PRIMARY KEY,
  last_run_at  TIMESTAMPTZ,
  last_status  TEXT NOT NULL DEFAULT 'IDLE',
  last_message TEXT,
  runs         INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at automático (função criada em 0001)
CREATE TRIGGER sport_leagues_set_updated_at   BEFORE UPDATE ON sport_leagues   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sport_teams_set_updated_at     BEFORE UPDATE ON sport_teams     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sport_fixtures_set_updated_at  BEFORE UPDATE ON sport_fixtures  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER bet_strategies_set_updated_at  BEFORE UPDATE ON bet_strategies  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER bet_tips_set_updated_at        BEFORE UPDATE ON bet_tips        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER provider_usage_set_updated_at  BEFORE UPDATE ON provider_usage  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sports_jobs_set_updated_at     BEFORE UPDATE ON sports_jobs     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
