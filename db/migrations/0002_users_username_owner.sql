-- ===========================================================================
-- 0002_users_username_owner.sql — Login por nick, dono da banca e troca de
-- senha obrigatória.
--
--   username             nick de acesso (único, sem diferenciar maiúsculas)
--   is_owner             dono da banca: único que altera banca inicial e metas
--   must_change_password TRUE enquanto a conta ainda usa a senha padrão
-- ===========================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username             TEXT,
  ADD COLUMN IF NOT EXISTS is_owner             BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- Nick: 3 a 32 caracteres, letras, números, ponto, hífen e sublinhado.
ALTER TABLE users
  ADD CONSTRAINT users_username_format
  CHECK (username IS NULL OR username ~ '^[A-Za-z0-9._-]{3,32}$');

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx
  ON users (lower(username)) WHERE username IS NOT NULL;

-- Só pode existir um dono.
CREATE UNIQUE INDEX IF NOT EXISTS users_single_owner_idx
  ON users (is_owner) WHERE is_owner = TRUE;
