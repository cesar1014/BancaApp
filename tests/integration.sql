-- ===========================================================================
-- Teste de integração do schema e das consultas agregadas.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/integration.sql
--
-- Roda dentro de uma transação e faz ROLLBACK no final: não deixa resíduo.
-- ===========================================================================
BEGIN;

DO $$
DECLARE
  v_bankroll  UUID;
  v_admin     UUID;
  v_partner   UUID;
  v_member_a  UUID;
  v_member_b  UUID;
  v_profit    BIGINT;
  v_contrib   BIGINT;
  v_withdraw  BIGINT;
  v_bankroll_cents BIGINT;
  v_count     INT;
  v_failed    BOOLEAN;
BEGIN
  -- -------------------------------------------------------------------------
  -- Massa de teste
  -- -------------------------------------------------------------------------
  INSERT INTO bankrolls (name) VALUES ('Banca de Teste') RETURNING id INTO v_bankroll;

  INSERT INTO settings (
    bankroll_id, initial_bankroll_cents, monthly_goal_cents, target_bankroll_cents,
    active_days, daily_goal_cents, max_risk_per_entry_bps,
    daily_stop_bps, weekly_stop_bps, monthly_stop_bps
  ) VALUES (v_bankroll, 500000, 300000, 800000, 30, 10000, 100, 300, 600, 1000);

  INSERT INTO users (name, email, password_hash, role)
  VALUES ('Admin Teste', 'admin@teste.local', 'scrypt$x$y', 'ADMIN')
  RETURNING id INTO v_admin;

  INSERT INTO users (name, email, password_hash, role)
  VALUES ('Sócio Teste', 'socio@teste.local', 'scrypt$x$y', 'PARTNER')
  RETURNING id INTO v_partner;

  INSERT INTO members (bankroll_id, user_id, display_name, share_bps, initial_contribution_cents)
  VALUES (v_bankroll, v_admin, 'Sócio A', 5000, 250000) RETURNING id INTO v_member_a;

  INSERT INTO members (bankroll_id, user_id, display_name, share_bps, initial_contribution_cents)
  VALUES (v_bankroll, v_partner, 'Sócio B', 5000, 250000) RETURNING id INTO v_member_b;

  -- -------------------------------------------------------------------------
  -- Entradas: um exemplo de cada status, com os valores que o domínio calcula
  -- -------------------------------------------------------------------------
  -- GREEN: stake 5000, odd 2.150 -> lucro 5750, retorno 10750
  INSERT INTO entries (bankroll_id, member_id, created_by_user_id, occurred_on, sport, event, market,
                       odd_milli, stake_cents, status, payout_cents, profit_cents)
  VALUES (v_bankroll, v_member_a, v_admin, '2026-09-01', 'Futebol', 'A x B', 'Over 1.5',
          2150, 5000, 'GREEN', 10750, 5750);

  -- RED: lucro = -stake
  INSERT INTO entries (bankroll_id, member_id, created_by_user_id, occurred_on, sport, event, market,
                       odd_milli, stake_cents, status, payout_cents, profit_cents)
  VALUES (v_bankroll, v_member_b, v_partner, '2026-09-02', 'Futebol', 'C x D', 'Ambas marcam',
          1900, 5000, 'RED', 0, -5000);

  -- VOID: retorno = stake, lucro = 0
  INSERT INTO entries (bankroll_id, member_id, created_by_user_id, occurred_on, sport, event, market,
                       odd_milli, stake_cents, status, payout_cents, profit_cents)
  VALUES (v_bankroll, v_member_a, v_admin, '2026-09-03', 'Tênis', 'E x F', 'Vitória E',
          2000, 4000, 'VOID', 4000, 0);

  -- CASHOUT: lucro = retorno - stake
  INSERT INTO entries (bankroll_id, member_id, created_by_user_id, occurred_on, sport, event, market,
                       odd_milli, stake_cents, status, payout_cents, profit_cents)
  VALUES (v_bankroll, v_member_b, v_partner, '2026-09-04', 'Basquete', 'G x H', 'Handicap',
          2050, 5000, 'CASHOUT', 7200, 2200);

  -- OPEN: não movimenta nada
  INSERT INTO entries (bankroll_id, member_id, created_by_user_id, occurred_on, sport, event, market,
                       odd_milli, stake_cents, status)
  VALUES (v_bankroll, v_member_a, v_admin, '2026-09-05', 'Futebol', 'I x J', 'Casa vence',
          2250, 5000, 'OPEN');

  -- Movimentações
  INSERT INTO transactions (bankroll_id, member_id, created_by_user_id, kind, amount_cents, occurred_on)
  VALUES (v_bankroll, v_member_a, v_admin, 'CONTRIBUTION', 100000, '2026-09-06');

  INSERT INTO transactions (bankroll_id, member_id, created_by_user_id, kind, amount_cents, occurred_on)
  VALUES (v_bankroll, v_member_b, v_admin, 'WITHDRAWAL', 20000, '2026-09-07');

  -- -------------------------------------------------------------------------
  -- 1. Lucro realizado ignora entradas em aberto
  -- -------------------------------------------------------------------------
  SELECT coalesce(sum(profit_cents), 0) INTO v_profit
  FROM entries WHERE bankroll_id = v_bankroll AND status <> 'OPEN';
  ASSERT v_profit = 2950, format('lucro realizado esperado 2950, obtido %s', v_profit);

  -- -------------------------------------------------------------------------
  -- 2. Aportes e retiradas somam em colunas separadas do lucro
  -- -------------------------------------------------------------------------
  SELECT
    coalesce(sum(amount_cents) FILTER (WHERE kind = 'CONTRIBUTION'), 0),
    coalesce(sum(amount_cents) FILTER (WHERE kind = 'WITHDRAWAL'), 0)
  INTO v_contrib, v_withdraw
  FROM transactions WHERE bankroll_id = v_bankroll;

  ASSERT v_contrib = 100000, 'aportes esperados 100000';
  ASSERT v_withdraw = 20000, 'retiradas esperadas 20000';

  -- -------------------------------------------------------------------------
  -- 3. Banca = inicial + lucro + aportes - retiradas
  -- -------------------------------------------------------------------------
  SELECT s.initial_bankroll_cents + v_profit + v_contrib - v_withdraw
  INTO v_bankroll_cents
  FROM settings s WHERE s.bankroll_id = v_bankroll;

  ASSERT v_bankroll_cents = 582950,
    format('banca esperada 582950, obtida %s', v_bankroll_cents);

  -- -------------------------------------------------------------------------
  -- 4. Total apostado para ROI exclui VOID e entradas em aberto
  -- -------------------------------------------------------------------------
  SELECT coalesce(sum(stake_cents), 0) INTO v_profit
  FROM entries WHERE bankroll_id = v_bankroll AND status IN ('GREEN', 'RED', 'CASHOUT');
  ASSERT v_profit = 15000, format('total apostado esperado 15000, obtido %s', v_profit);

  -- -------------------------------------------------------------------------
  -- 5. Lucro anterior a uma data (usado para a banca de abertura do mês)
  -- -------------------------------------------------------------------------
  SELECT coalesce(sum(profit_cents), 0) INTO v_profit
  FROM entries WHERE bankroll_id = v_bankroll AND status <> 'OPEN' AND occurred_on < '2026-09-03';
  ASSERT v_profit = 750, format('lucro até 02/09 esperado 750, obtido %s', v_profit);

  -- -------------------------------------------------------------------------
  -- 6. O banco recusa lucro incoerente com o status (última linha de defesa)
  -- -------------------------------------------------------------------------
  v_failed := FALSE;
  BEGIN
    INSERT INTO entries (bankroll_id, member_id, occurred_on, sport, event, market,
                         odd_milli, stake_cents, status, payout_cents, profit_cents)
    VALUES (v_bankroll, v_member_a, '2026-09-08', 'Futebol', 'Fraude', 'Mercado',
            2000, 5000, 'RED', 0, 999999); -- RED com lucro positivo
  EXCEPTION WHEN check_violation THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'o banco deveria recusar um RED com lucro positivo';

  v_failed := FALSE;
  BEGIN
    INSERT INTO entries (bankroll_id, member_id, occurred_on, sport, event, market,
                         odd_milli, stake_cents, status, payout_cents, profit_cents)
    VALUES (v_bankroll, v_member_a, '2026-09-08', 'Futebol', 'Fraude', 'Mercado',
            2000, 5000, 'VOID', 0, 5000); -- VOID precisa devolver a stake
  EXCEPTION WHEN check_violation THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'o banco deveria recusar um VOID com lucro';

  v_failed := FALSE;
  BEGIN
    INSERT INTO entries (bankroll_id, member_id, occurred_on, sport, event, market,
                         odd_milli, stake_cents, status)
    VALUES (v_bankroll, v_member_a, '2026-09-08', 'Futebol', 'Odd inválida', 'Mercado',
            1000, 5000, 'OPEN'); -- odd 1.00 não é aposta
  EXCEPTION WHEN check_violation THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'o banco deveria recusar odd menor ou igual a 1,00';

  v_failed := FALSE;
  BEGIN
    INSERT INTO transactions (bankroll_id, kind, amount_cents, occurred_on)
    VALUES (v_bankroll, 'CONTRIBUTION', -100, '2026-09-08');
  EXCEPTION WHEN check_violation THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'o banco deveria recusar movimentação com valor negativo';

  -- -------------------------------------------------------------------------
  -- 7. Isolamento entre bancas: uma entrada só aparece na sua própria banca
  -- -------------------------------------------------------------------------
  SELECT count(*) INTO v_count FROM entries
  WHERE bankroll_id <> v_bankroll AND id IN (SELECT id FROM entries WHERE bankroll_id = v_bankroll);
  ASSERT v_count = 0, 'entradas não podem vazar entre bancas';

  -- -------------------------------------------------------------------------
  -- 8. E-mail é único ignorando maiúsculas e espaços
  -- -------------------------------------------------------------------------
  v_failed := FALSE;
  BEGIN
    INSERT INTO users (name, email, password_hash) VALUES ('Duplicado', '  ADMIN@TESTE.LOCAL ', 'x');
  EXCEPTION WHEN unique_violation THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'e-mail duplicado deveria ser recusado';

  -- -------------------------------------------------------------------------
  -- 9. Um usuário não pode ser dois sócios da mesma banca
  -- -------------------------------------------------------------------------
  v_failed := FALSE;
  BEGIN
    INSERT INTO members (bankroll_id, user_id, display_name) VALUES (v_bankroll, v_admin, 'Repetido');
  EXCEPTION WHEN unique_violation THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'o mesmo usuário não pode ser dois sócios da mesma banca';

  -- -------------------------------------------------------------------------
  -- 10. Sócio com entradas não pode ser apagado (histórico é preservado)
  -- -------------------------------------------------------------------------
  v_failed := FALSE;
  BEGIN
    DELETE FROM members WHERE id = v_member_a;
  EXCEPTION WHEN foreign_key_violation THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'sócio com entradas não pode ser removido';

  -- -------------------------------------------------------------------------
  -- 11. Fechamento mensal é único por período
  -- -------------------------------------------------------------------------
  INSERT INTO monthly_closings (
    bankroll_id, year, month, opening_bankroll_cents, entries_profit_cents,
    contributions_cents, withdrawals_cents, closing_bankroll_cents, goal_cents,
    goal_progress_bps, roi_bps, entries_count, greens, reds, voids, cashouts,
    hit_rate_bps, total_staked_cents, max_stake_cents, snapshot
  ) VALUES (v_bankroll, 2026, 9, 500000, 2950, 100000, 20000, 582950, 300000,
            98, 1967, 5, 1, 1, 1, 1, 5000, 15000, 5000, '{}'::jsonb);

  v_failed := FALSE;
  BEGIN
    INSERT INTO monthly_closings (
      bankroll_id, year, month, opening_bankroll_cents, entries_profit_cents,
      contributions_cents, withdrawals_cents, closing_bankroll_cents, goal_cents,
      goal_progress_bps, roi_bps, entries_count, greens, reds, voids, cashouts,
      hit_rate_bps, total_staked_cents, max_stake_cents, snapshot
    ) VALUES (v_bankroll, 2026, 9, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, '{}'::jsonb);
  EXCEPTION WHEN unique_violation THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'não pode haver dois fechamentos do mesmo mês';

  -- -------------------------------------------------------------------------
  -- 12. Detecção de período fechado (bloqueio de edições retroativas)
  -- -------------------------------------------------------------------------
  SELECT count(*) INTO v_count FROM monthly_closings
  WHERE bankroll_id = v_bankroll
    AND year = EXTRACT(YEAR FROM DATE '2026-09-15')::int
    AND month = EXTRACT(MONTH FROM DATE '2026-09-15')::int;
  ASSERT v_count = 1, '15/09/2026 deveria estar dentro de um mês fechado';

  SELECT count(*) INTO v_count FROM monthly_closings
  WHERE bankroll_id = v_bankroll
    AND year = EXTRACT(YEAR FROM DATE '2026-10-01')::int
    AND month = EXTRACT(MONTH FROM DATE '2026-10-01')::int;
  ASSERT v_count = 0, '01/10/2026 não deveria estar em mês fechado';

  -- -------------------------------------------------------------------------
  -- 13. Auditoria grava valores antes e depois
  -- -------------------------------------------------------------------------
  INSERT INTO audit_logs (bankroll_id, user_id, user_name, action, entity, entity_id,
                          description, old_values, new_values)
  VALUES (v_bankroll, v_admin, 'Admin Teste', 'SETTINGS_UPDATE', 'settings', NULL,
          'Alterou a stake máxima', '{"risco":"1,00%"}'::jsonb, '{"risco":"1,50%"}'::jsonb);

  SELECT count(*) INTO v_count FROM audit_logs
  WHERE bankroll_id = v_bankroll AND new_values ->> 'risco' = '1,50%';
  ASSERT v_count = 1, 'auditoria deveria registrar valor anterior e novo';

  -- -------------------------------------------------------------------------
  -- 14. updated_at é atualizado automaticamente
  -- -------------------------------------------------------------------------
  PERFORM pg_sleep(0.01);
  UPDATE entries SET note = 'observação' WHERE bankroll_id = v_bankroll AND status = 'GREEN';
  SELECT count(*) INTO v_count FROM entries
  WHERE bankroll_id = v_bankroll AND status = 'GREEN' AND updated_at > created_at;
  ASSERT v_count = 1, 'updated_at deveria ter avançado';

  RAISE NOTICE 'INTEGRAÇÃO: todos os 14 blocos de verificação passaram.';
END $$;

ROLLBACK;
