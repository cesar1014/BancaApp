-- ===========================================================================
-- 0004_bilhetes.sql — Bilhetes: múltiplas publicadas por fontes públicas
--
-- CONVENÇÕES: *_cents BIGINT (centavos) · *_milli INTEGER (odd × 1000; linha
-- × 1000) · *_bps INTEGER (percentual em basis points).
--
-- Um bilhete é conteúdo de terceiro. O app guarda a odd informada, confere
-- a odd real perna a perna, calcula a margem acumulada e registra o resultado
-- para medir cada fonte.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- tip_sources — fontes públicas de bilhetes
-- ---------------------------------------------------------------------------
CREATE TABLE tip_sources (
  slug       TEXT PRIMARY KEY CHECK (slug ~ '^[a-z0-9-]{2,40}$'),
  name       TEXT NOT NULL,
  url        TEXT NOT NULL,
  country    TEXT NOT NULL CHECK (country IN ('BR','INT')),
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO tip_sources (slug, name, url, country, notes) VALUES
  ('apostasepalpites', 'Apostas e Palpites', 'https://www.apostasepalpites.com.br/palpites/', 'BR', 'Prioridade máxima: cobre Brasileirão. Não arquiva: coleta diária.'),
  ('aposta10',         'Aposta10',           'https://aposta10.com/blog/c/bilhetes-prontos',  'BR', '3 bilhetes/dia em URL datada; seleções em texto, sem odd por perna.'),
  ('predictlix',       'Predictlix',         'https://predictlix.com/accumulator-tips/',      'INT', 'Melhor estrutura; recicla os mesmos jogos em vários bilhetes.'),
  ('mightytips',       'MightyTips',         'https://www.mightytips.com/football-predictions/accumulator/', 'INT', 'Dados limpos, data absoluta; só ligas top europeias.'),
  ('apwin',            'APWin',              'https://apwin.com/accumulator-predictions/',    'INT', '1 bilhete/dia com odd por perna; hoje, amanhã e depois.');

-- ---------------------------------------------------------------------------
-- tip_slips — o bilhete
-- ---------------------------------------------------------------------------
CREATE TABLE tip_slips (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_slug         TEXT NOT NULL REFERENCES tip_sources(slug) ON DELETE CASCADE,
  title               TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  reference_date      DATE NOT NULL,
  source_url          TEXT NOT NULL,
  -- Mesmas seleções (times canônicos + mercado) = mesmo bilhete, em qualquer página.
  dedupe_hash         TEXT NOT NULL,

  informed_odd_milli  INTEGER CHECK (informed_odd_milli IS NULL OR informed_odd_milli > 1000),
  computed_odd_milli  INTEGER CHECK (computed_odd_milli IS NULL OR computed_odd_milli > 1000),
  real_odd_milli      INTEGER CHECK (real_odd_milli IS NULL OR real_odd_milli > 1000),
  margin_bps          INTEGER CHECK (margin_bps IS NULL OR margin_bps >= 0),
  margin_known_legs   INTEGER NOT NULL DEFAULT 0,
  legs_count          INTEGER NOT NULL DEFAULT 0 CHECK (legs_count >= 0),
  verified_legs       INTEGER NOT NULL DEFAULT 0 CHECK (verified_legs >= 0),
  verification        TEXT NOT NULL DEFAULT 'NONE' CHECK (verification IN ('FULL','PARTIAL','NONE')),

  status              TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','SETTLED','PENDING','VOID')),
  result              TEXT CHECK (result IS NULL OR result IN ('GREEN','RED','PUSH')),
  effective_odd_milli INTEGER CHECK (effective_odd_milli IS NULL OR effective_odd_milli >= 1000),
  stake_cents         BIGINT NOT NULL DEFAULT 10000 CHECK (stake_cents > 0),
  payout_cents        BIGINT NOT NULL DEFAULT 0 CHECK (payout_cents >= 0),
  profit_cents        BIGINT NOT NULL DEFAULT 0,

  collected_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at         TIMESTAMPTZ,
  settled_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (source_slug, reference_date, dedupe_hash),
  -- Mesma coerência de entries/bet_tips: resultado, retorno e lucro batem.
  CONSTRAINT tip_slips_result_consistency CHECK (
    (result IS NULL    AND payout_cents = 0 AND profit_cents = 0) OR
    (result = 'RED'    AND payout_cents = 0 AND profit_cents = -stake_cents) OR
    (result = 'PUSH'   AND payout_cents = stake_cents AND profit_cents = 0) OR
    (result = 'GREEN'  AND payout_cents = stake_cents + profit_cents AND profit_cents >= 0)
  )
);

CREATE INDEX tip_slips_date_idx   ON tip_slips (reference_date DESC, source_slug);
CREATE INDEX tip_slips_status_idx ON tip_slips (status, reference_date DESC);
CREATE INDEX tip_slips_source_idx ON tip_slips (source_slug, status);

-- ---------------------------------------------------------------------------
-- tip_slip_legs — cada perna do bilhete
-- ---------------------------------------------------------------------------
CREATE TABLE tip_slip_legs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_id              UUID NOT NULL REFERENCES tip_slips(id) ON DELETE CASCADE,
  position             INTEGER NOT NULL CHECK (position >= 1),
  home_name            TEXT NOT NULL,
  away_name            TEXT NOT NULL,
  league               TEXT,
  kickoff              TIMESTAMPTZ,
  market_text          TEXT NOT NULL,
  selection_text       TEXT NOT NULL,
  -- Interpretação nos termos do motor (null = mercado não reconhecido)
  market_key           TEXT,
  selection_key        TEXT,
  line_milli           INTEGER,
  label                TEXT NOT NULL,
  -- Odd publicada pela fonte (várias fontes só publicam a total)
  odd_milli            INTEGER CHECK (odd_milli IS NULL OR odd_milli > 1000),
  -- Odd real encontrada nas cotações
  real_odd_milli       INTEGER CHECK (real_odd_milli IS NULL OR real_odd_milli > 1000),
  real_bookmaker       TEXT,
  real_captured_at     TIMESTAMPTZ,
  margin_bps           INTEGER CHECK (margin_bps IS NULL OR margin_bps >= 0),
  -- Casamento com a partida real (id determinístico de sport_fixtures)
  fixture_id           TEXT REFERENCES sport_fixtures(id) ON DELETE SET NULL,
  match_confidence_bps INTEGER CHECK (match_confidence_bps IS NULL OR match_confidence_bps BETWEEN 0 AND 10000),
  result               TEXT CHECK (result IS NULL OR result IN ('GREEN','RED','PUSH')),
  settled_at           TIMESTAMPTZ,
  settled_by           TEXT CHECK (settled_by IS NULL OR settled_by IN ('AUTO','MANUAL')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slip_id, position)
);

CREATE INDEX tip_slip_legs_slip_idx    ON tip_slip_legs (slip_id, position);
CREATE INDEX tip_slip_legs_fixture_idx ON tip_slip_legs (fixture_id) WHERE fixture_id IS NOT NULL;
CREATE INDEX tip_slip_legs_pending_idx ON tip_slip_legs (result) WHERE result IS NULL;

-- ---------------------------------------------------------------------------
-- tip_source_runs — log de cada coleta (e cooldown: 1 request/fonte/dia)
-- ---------------------------------------------------------------------------
CREATE TABLE tip_source_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_slug  TEXT NOT NULL REFERENCES tip_sources(slug) ON DELETE CASCADE,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','OK','EMPTY','ERROR','SKIPPED')),
  slips_found  INTEGER NOT NULL DEFAULT 0,
  slips_new    INTEGER NOT NULL DEFAULT 0,
  error        TEXT
);

CREATE INDEX tip_source_runs_source_idx ON tip_source_runs (source_slug, started_at DESC);

CREATE TRIGGER tip_sources_set_updated_at BEFORE UPDATE ON tip_sources FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tip_slips_set_updated_at   BEFORE UPDATE ON tip_slips   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
