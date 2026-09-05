-- ===========================================================================
-- 0005_calls.sql — Calls avulsas publicadas em canal aberto do Telegram.
--
-- As cinco fontes existentes publicam MÚLTIPLAS num site, com jogo, mercado e
-- odd por perna. Um canal de Telegram publica outra coisa: uma seleção só, com
-- unidade e odd, e o resultado marcado depois no próprio post.
--
-- A diferença que manda no desenho: a PARTIDA NÃO VEM NO TEXTO. O canal
-- escreve "+2.0 Gols @1.65 na Betano" e o jogo fica só na imagem do cupom.
-- Sem partida, não há como conferir a odd contra o mercado, calcular margem
-- nem liquidar pelo placar real — por isso a call vive numa tabela própria, e
-- não como bilhete de uma perna: forçá-la em tip_slips encheria o card de
-- campos vazios e sujaria a estatística das outras fontes.
--
-- O que sobra é o que interessa: o canal publica o resultado, e a unidade é
-- constante. Dá para acumular taxa de acerto, ROI e profit factor honestos.
-- ===========================================================================

-- Uma fonte agora pode ser um site ou um canal aberto do Telegram.
ALTER TABLE tip_sources
  ADD COLUMN IF NOT EXISTS kind    TEXT NOT NULL DEFAULT 'SITE'
    CHECK (kind IN ('SITE', 'TELEGRAM')),
  -- @nome do canal, sem arroba. Só para kind = 'TELEGRAM'.
  ADD COLUMN IF NOT EXISTS channel TEXT,
  -- Início do acompanhamento. Post anterior a isto é ignorado: o placar conta
  -- do momento em que passamos a olhar, sem depender de o canal ter marcado
  -- corretamente resultados de meses atrás — o que ninguém pode verificar.
  --
  -- O corte é a MEIA-NOITE do dia em que o canal entrou, não o instante do
  -- cadastro. As calls do próprio dia já entram, e o placar continua sem
  -- histórico antigo. Cortar no minuto exato só deixaria a tela vazia até o
  -- dia seguinte, sem ganho nenhum de confiabilidade.
  ADD COLUMN IF NOT EXISTS tracking_since TIMESTAMPTZ;

ALTER TABLE tip_sources
  ADD CONSTRAINT tip_sources_channel_required
  CHECK (kind <> 'TELEGRAM' OR channel IS NOT NULL);

CREATE TABLE tip_calls (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_slug   TEXT NOT NULL REFERENCES tip_sources(slug) ON DELETE CASCADE,
  -- Id da mensagem dentro do canal. Com a fonte, identifica a call para
  -- sempre: é por ele que a coleta reconhece um post já visto e atualiza o
  -- resultado que o canal editou depois.
  post_id       TEXT NOT NULL,
  post_url      TEXT NOT NULL,
  posted_at     TIMESTAMPTZ NOT NULL,

  -- Texto da seleção como publicado ("+2.0 Gols", "Criada Al Hilal").
  selection     TEXT NOT NULL CHECK (length(btrim(selection)) BETWEEN 1 AND 200),
  -- Pista de time, quando o nome escapa na seleção. Nunca afirma a partida.
  team_hint     TEXT,
  -- Unidades × 100. NULL quando o canal não declarou (o placar assume 1).
  units_centis  INTEGER CHECK (units_centis IS NULL OR units_centis BETWEEN 1 AND 10000),
  odd_milli     INTEGER CHECK (odd_milli IS NULL OR odd_milli > 1000),
  bookmaker     TEXT,

  result        TEXT CHECK (result IS NULL OR result IN ('GREEN', 'RED', 'VOID')),
  -- Quando o resultado apareceu para nós (o canal edita o post depois).
  settled_at    TIMESTAMPTZ,

  raw_text      TEXT NOT NULL DEFAULT '',
  collected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Resultado e horário do resultado andam juntos.
  CONSTRAINT tip_calls_result_consistent
    CHECK ((result IS NULL AND settled_at IS NULL) OR (result IS NOT NULL AND settled_at IS NOT NULL))
);

CREATE UNIQUE INDEX tip_calls_source_post_idx ON tip_calls (source_slug, post_id);
CREATE INDEX tip_calls_posted_idx  ON tip_calls (posted_at DESC);
CREATE INDEX tip_calls_pending_idx ON tip_calls (source_slug, posted_at DESC) WHERE result IS NULL;

-- ---------------------------------------------------------------------------
-- Canais acompanhados
--
-- Só entram canais ABERTOS, com página pública em t.me/s/<canal>, lida sem
-- login e sem chave. Canal fechado (link de convite t.me/+...) exigiria entrar
-- com uma conta pessoal, o que não se faz aqui.
--
-- tracking_since fica na meia-noite de hoje, no fuso da banca: o placar
-- começa do zero e conta a partir do dia em que o canal entrou.
-- ---------------------------------------------------------------------------
INSERT INTO tip_sources (slug, name, url, country, kind, channel, tracking_since, notes) VALUES
  ('lacasadetips', 'La Casa de Tips', 'https://t.me/canaldolacasa', 'BR', 'TELEGRAM', 'canaldolacasa', date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo',
   'Canal aberto, ~6 a 8 calls por dia, 1 unidade cada. Publica resultado editando o post. Todo post e #PUBLI com link de afiliado.'),
  ('tipsbrasilfree', 'Tips Brasil Free', 'https://t.me/Tipsbrasiloficial', 'BR', 'TELEGRAM', 'Tipsbrasiloficial', date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo',
   'Canal aberto, calls ao vivo. Marca o resultado na linha da odd, nao na da selecao.')
ON CONFLICT (slug) DO NOTHING;
