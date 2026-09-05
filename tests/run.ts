/* eslint-disable no-console */
/**
 * Suíte de testes do domínio.
 *
 *   npm test
 *
 * Cobre as regras que sustentam o dinheiro do grupo: cálculo de resultado por
 * status, banca, ROI, metas diárias/mensais, stops, participação dos sócios e
 * fechamento mensal. Sem framework externo — apenas node:assert.
 */
import assert from 'node:assert/strict';

import {
  formatMoney,
  formatMoneySigned,
  parseMoneyToCents,
  realsToCents,
} from '../src/lib/money';
import {
  applyBps,
  bpsToPercent,
  formatBps,
  formatOdd,
  oddToMilli,
  parseOddToMilli,
  parsePercentToBps,
  ratioToBps,
} from '../src/lib/numbers';
import {
  addDays,
  daysInMonth,
  formatDateBR,
  isIsoDate,
  isoWeekRange,
  listMonthDates,
  monthRange,
  todayIn,
} from '../src/lib/datetime';
import { computeEntryResult, potentialReturnCents } from '../src/lib/domain/entry';
import {
  computeBankrollCents,
  summarizeEntries,
  summarizeTransactions,
  type EntryLike,
  type TransactionLike,
} from '../src/lib/domain/metrics';
import { buildDailySeries, computeGoalProgress, resolveDailyGoalCents } from '../src/lib/domain/goals';
import {
  checkStakeLimit,
  computeRiskLimits,
  evaluateEntryRisk,
  evaluateStops,
} from '../src/lib/domain/risk';
import { computePartnerShares, distributeByShares, suggestSharesFromCapital } from '../src/lib/domain/partners';
import { buildMonthlyClosing } from '../src/lib/domain/closing';
import { computeMemberStats } from '../src/lib/domain/stats';
import { hashPassword, verifyPassword } from '../src/lib/auth/password';
import { defaultUserPassword } from '../src/lib/auth/default-password';
import { changePasswordSchema } from '../src/lib/validation/schemas';
import { signSessionToken, verifySessionToken } from '../src/lib/auth/token';
import type { BankrollSettings } from '../src/lib/domain/types';

import { group, run, test } from './harness';
import './sports';
import './bilhetes';

// ---------------------------------------------------------------------------
// Configuração base usada nos testes (espelha o seed inicial)
// ---------------------------------------------------------------------------
const SETTINGS: BankrollSettings = {
  bankrollId: 'b1',
  initialBankrollCents: 500_000, // R$ 5.000
  monthlyGoalCents: 300_000, // R$ 3.000
  targetBankrollCents: 800_000, // R$ 8.000
  activeDays: 30,
  dailyGoalMode: 'AUTO',
  dailyGoalCents: 0,
  riskBase: 'CURRENT',
  maxRiskPerEntryBps: 100, // 1%
  maxStakeCapCents: null,
  dailyStopBps: 300, // 3%
  weeklyStopBps: 600, // 6%
  monthlyStopBps: 1000, // 10%
  stakeLimitPolicy: 'BLOCK',
  stopLimitPolicy: 'WARN',
  partnersCanCreateEntries: true,
  updatedAt: new Date().toISOString(),
};

const entry = (
  over: Partial<EntryLike> & { oddMilli?: number } = {},
): EntryLike & { oddMilli: number; memberId: string } => ({
  occurredOn: '2026-09-01',
  status: 'GREEN',
  stakeCents: 5_000,
  profitCents: 5_000,
  oddMilli: 2_000,
  memberId: 'm1',
  ...over,
});

// ===========================================================================
group('Dinheiro');
// ===========================================================================
test('interpreta valores digitados em pt-BR', () => {
  assert.equal(parseMoneyToCents('1.234,56'), 123_456);
  assert.equal(parseMoneyToCents('1234,56'), 123_456);
  assert.equal(parseMoneyToCents('1234.56'), 123_456);
  assert.equal(parseMoneyToCents('R$ 50'), 5_000);
  assert.equal(parseMoneyToCents('50'), 5_000);
  assert.equal(parseMoneyToCents('-120,50'), -12_050);
  assert.equal(parseMoneyToCents('0,05'), 5);
  assert.equal(parseMoneyToCents(''), null);
  assert.equal(parseMoneyToCents('abc'), null);
});

test('formata em Real com sinal explícito quando faz sentido', () => {
  assert.equal(formatMoney(123_456).replace(/ /g, ' '), 'R$ 1.234,56');
  assert.equal(formatMoneySigned(15_300).replace(/ /g, ' '), '+R$ 153,00');
  assert.equal(formatMoneySigned(-15_300).replace(/ /g, ' '), '−R$ 153,00');
  assert.equal(formatMoneySigned(0).replace(/ /g, ' '), 'R$ 0,00');
});

test('não perde centavos em somas longas (motivo de não usar float)', () => {
  let cents = 0;
  for (let i = 0; i < 10_000; i += 1) cents += realsToCents(0.1);
  assert.equal(cents, 100_000); // R$ 1.000,00 exatos
});

// ===========================================================================
group('Odds e percentuais');
// ===========================================================================
test('converte odds sem float', () => {
  assert.equal(oddToMilli(2.15), 2_150);
  assert.equal(parseOddToMilli('2,15'), 2_150);
  assert.equal(parseOddToMilli('1.85'), 1_850);
  assert.equal(parseOddToMilli('abc'), null);
  assert.equal(formatOdd(2_150), '2,15');
});

test('converte percentuais em basis points', () => {
  assert.equal(parsePercentToBps('1'), 100);
  assert.equal(parsePercentToBps('1,5'), 150);
  assert.equal(parsePercentToBps('25'), 2_500);
  assert.equal(bpsToPercent(150), 1.5);
  assert.equal(formatBps(150), '1,50%');
  assert.equal(applyBps(500_000, 100), 5_000); // 1% de R$ 5.000 = R$ 50
  assert.equal(ratioToBps(1, 0), null);
});

// ===========================================================================
group('Datas');
// ===========================================================================
test('valida e navega entre datas sem deslocamento de fuso', () => {
  assert.equal(isIsoDate('2026-09-05'), true);
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(formatDateBR('2026-09-05'), '05/09/2026');
  assert.equal(listMonthDates(2026, 9).length, 30);
  assert.deepEqual(monthRange(2026, 9), { start: '2026-09-01', end: '2026-09-30' });
});

test('semana ISO vai de segunda a domingo', () => {
  // 2026-09-04 é uma sexta-feira
  assert.deepEqual(isoWeekRange('2026-09-04'), { start: '2026-08-31', end: '2026-09-06' });
  // domingo pertence à semana que começou na segunda anterior
  assert.deepEqual(isoWeekRange('2026-09-06'), { start: '2026-08-31', end: '2026-09-06' });
  assert.deepEqual(isoWeekRange('2026-09-07'), { start: '2026-09-07', end: '2026-09-13' });
});

test('hoje respeita o fuso da banca', () => {
  // 2026-01-01T02:00Z ainda é 31/12 em São Paulo (UTC-3)
  const instant = new Date('2026-01-01T02:00:00Z');
  assert.equal(todayIn('America/Sao_Paulo', instant), '2025-12-31');
  assert.equal(todayIn('UTC', instant), '2026-01-01');
});

// ===========================================================================
group('Resultado da entrada');
// ===========================================================================
test('GREEN: lucro = stake × (odd − 1)', () => {
  const result = computeEntryResult({ status: 'GREEN', stakeCents: 5_000, oddMilli: 2_150 });
  assert.equal(result.profitCents, 5_750); // R$ 50 × 1,15 = R$ 57,50
  assert.equal(result.payoutCents, 10_750); // retorno = R$ 107,50
});

test('RED: lucro = −stake', () => {
  const result = computeEntryResult({ status: 'RED', stakeCents: 5_000, oddMilli: 2_150 });
  assert.equal(result.profitCents, -5_000);
  assert.equal(result.payoutCents, 0);
});

test('VOID: lucro = 0 e a stake volta integralmente', () => {
  const result = computeEntryResult({ status: 'VOID', stakeCents: 5_000, oddMilli: 2_150 });
  assert.equal(result.profitCents, 0);
  assert.equal(result.payoutCents, 5_000);
});

test('CASHOUT: lucro = retorno − stake (positivo ou negativo)', () => {
  const win = computeEntryResult({
    status: 'CASHOUT',
    stakeCents: 5_000,
    oddMilli: 2_150,
    payoutCents: 7_200,
  });
  assert.equal(win.profitCents, 2_200);

  const loss = computeEntryResult({
    status: 'CASHOUT',
    stakeCents: 5_000,
    oddMilli: 2_150,
    payoutCents: 3_100,
  });
  assert.equal(loss.profitCents, -1_900);
});

test('CASHOUT sem retorno informado é recusado', () => {
  assert.throws(
    () => computeEntryResult({ status: 'CASHOUT', stakeCents: 5_000, oddMilli: 2_000 }),
    /retorno do cashout/i,
  );
});

test('entrada em aberto não movimenta nada', () => {
  const result = computeEntryResult({ status: 'OPEN', stakeCents: 5_000, oddMilli: 2_150 });
  assert.equal(result.profitCents, 0);
  assert.equal(result.payoutCents, 0);
  assert.equal(potentialReturnCents(5_000, 2_150), 10_750);
});

test('odd inválida e stake inválida são recusadas', () => {
  assert.throws(() => computeEntryResult({ status: 'GREEN', stakeCents: 0, oddMilli: 2_000 }));
  assert.throws(() => computeEntryResult({ status: 'GREEN', stakeCents: 100, oddMilli: 1_000 }));
});

test('arredondamento de lucro é meio-para-cima, em centavos', () => {
  // R$ 33,33 × (1,333 − 1) = R$ 11,098... → R$ 11,10
  const result = computeEntryResult({ status: 'GREEN', stakeCents: 3_333, oddMilli: 1_333 });
  assert.equal(result.profitCents, 1_110);
  assert.equal(result.payoutCents, 4_443);
});

// ===========================================================================
group('Banca, ROI e agregações');
// ===========================================================================
test('banca = inicial + lucro + aportes − retiradas', () => {
  assert.equal(
    computeBankrollCents({
      initialBankrollCents: 500_000,
      realizedProfitCents: 153_000,
      contributionsCents: 50_000,
      withdrawalsCents: 20_000,
    }),
    683_000,
  );
});

test('aporte não é lucro e retirada não é prejuízo', () => {
  const transactions: TransactionLike[] = [
    { occurredOn: '2026-09-02', kind: 'CONTRIBUTION', amountCents: 100_000 },
    { occurredOn: '2026-09-10', kind: 'WITHDRAWAL', amountCents: 20_000 },
  ];
  const cash = summarizeTransactions(transactions);
  assert.equal(cash.contributionsCents, 100_000);
  assert.equal(cash.withdrawalsCents, 20_000);
  assert.equal(cash.netCents, 80_000);

  // As entradas continuam com o mesmo lucro: o caixa não contamina o resultado.
  const summary = summarizeEntries([
    entry({ status: 'GREEN', stakeCents: 5_000, profitCents: 5_000 }),
    entry({ status: 'RED', stakeCents: 5_000, profitCents: -5_000 }),
  ]);
  assert.equal(summary.profitCents, 0);
  assert.equal(summary.roiBps, 0);
});

test('resumo de entradas conta cada status e calcula ROI e acerto', () => {
  const summary = summarizeEntries([
    entry({ status: 'GREEN', stakeCents: 10_000, profitCents: 8_000, oddMilli: 1_800 }),
    entry({ status: 'GREEN', stakeCents: 10_000, profitCents: 5_000, oddMilli: 1_500 }),
    entry({ status: 'RED', stakeCents: 10_000, profitCents: -10_000 }),
    entry({ status: 'VOID', stakeCents: 20_000, profitCents: 0 }),
    entry({ status: 'CASHOUT', stakeCents: 10_000, profitCents: 2_000 }),
    entry({ status: 'OPEN', stakeCents: 7_000, profitCents: 0 }),
  ]);

  assert.equal(summary.count, 6);
  assert.equal(summary.settledCount, 5);
  assert.equal(summary.openCount, 1);
  assert.equal(summary.greens, 2);
  assert.equal(summary.reds, 1);
  assert.equal(summary.voids, 1);
  assert.equal(summary.cashouts, 1);
  assert.equal(summary.profitCents, 5_000);
  // Total apostado exclui VOID (stake devolvida) e entradas em aberto.
  assert.equal(summary.totalStakedCents, 40_000);
  assert.equal(summary.roiBps, 1_250); // 5.000 / 40.000 = 12,50%
  assert.equal(summary.hitRateBps, 6_667); // 2 de 3 decididas
  assert.equal(summary.maxStakeCents, 20_000);
  assert.equal(summary.openStakeCents, 7_000);
  assert.equal(summary.avgProfitCents, 1_000);
});

test('ROI é nulo (e não zero) quando nada foi arriscado', () => {
  const summary = summarizeEntries([entry({ status: 'OPEN', profitCents: 0 })]);
  assert.equal(summary.roiBps, null);
  assert.equal(summary.hitRateBps, null);
});

// ===========================================================================
group('Metas');
// ===========================================================================
test('meta diária = meta mensal ÷ dias ativos', () => {
  assert.equal(
    resolveDailyGoalCents({
      mode: 'AUTO',
      monthlyGoalCents: 300_000,
      activeDays: 30,
      manualDailyGoalCents: 0,
    }),
    10_000, // R$ 100,00
  );
  assert.equal(
    resolveDailyGoalCents({
      mode: 'MANUAL',
      monthlyGoalCents: 300_000,
      activeDays: 30,
      manualDailyGoalCents: 12_000,
    }),
    12_000,
  );
});

test('progresso da meta mensal (exemplo da especificação)', () => {
  const progress = computeGoalProgress(300_000, 153_000);
  assert.equal(progress.progressBps, 5_100); // 51%
  assert.equal(progress.remainingCents, 147_000);
  assert.equal(progress.isReached, false);

  const reached = computeGoalProgress(300_000, 320_000);
  assert.equal(reached.isReached, true);
  assert.equal(reached.remainingCents, 0);
  assert.equal(reached.progressBarBps, 10_000); // barra nunca passa de 100%

  const negative = computeGoalProgress(300_000, -50_000);
  assert.equal(negative.progressBarBps, 0);
});

test('série diária acumula meta e realizado (exemplo da especificação)', () => {
  const series = buildDailySeries({
    year: 2026,
    month: 9,
    monthlyGoalCents: 300_000,
    dailyGoalCents: 10_000,
    openingBankrollCents: 500_000,
    dailyStopCents: 15_000,
    today: '2026-09-03',
    entries: [
      entry({ occurredOn: '2026-09-01', profitCents: 12_500 }),
      entry({ occurredOn: '2026-09-02', profitCents: 5_500 }),
      entry({ occurredOn: '2026-09-03', profitCents: 16_000 }),
    ],
    transactions: [],
  });

  assert.equal(series.length, 30);

  const [d1, d2, d3] = series as [(typeof series)[number], (typeof series)[number], (typeof series)[number]];

  assert.equal(d1.cumulativeGoalCents, 10_000);
  assert.equal(d1.cumulativeProfitCents, 12_500);
  assert.equal(d1.status, 'GOAL_HIT');
  assert.equal(d1.targetBankrollCents, 510_000);
  assert.equal(d1.realBankrollCents, 512_500);

  assert.equal(d2.cumulativeGoalCents, 20_000);
  assert.equal(d2.cumulativeProfitCents, 18_000);
  assert.equal(d2.differenceCents, -2_000);
  assert.equal(d2.status, 'BELOW_GOAL');

  assert.equal(d3.cumulativeGoalCents, 30_000);
  assert.equal(d3.cumulativeProfitCents, 34_000);
  assert.equal(d3.status, 'GOAL_HIT');
  assert.equal(d3.differenceCents, 4_000);

  // Dias futuros ficam marcados como tal e não contam como abaixo da meta.
  assert.equal(series[3]!.status, 'FUTURE');
  assert.equal(series[29]!.cumulativeGoalCents, 300_000);
});

test('dia sem entradas não é "abaixo da meta", é "sem entradas"', () => {
  const series = buildDailySeries({
    year: 2026,
    month: 9,
    monthlyGoalCents: 300_000,
    dailyGoalCents: 10_000,
    openingBankrollCents: 500_000,
    dailyStopCents: 15_000,
    today: '2026-09-05',
    entries: [entry({ occurredOn: '2026-09-01', profitCents: 12_500 })],
    transactions: [],
  });
  assert.equal(series[1]!.status, 'NO_ACTIVITY');
  assert.equal(series[1]!.entriesCount, 0);
});

test('dia com prejuízo além do stop é marcado como STOP ATINGIDO', () => {
  const series = buildDailySeries({
    year: 2026,
    month: 9,
    monthlyGoalCents: 300_000,
    dailyGoalCents: 10_000,
    openingBankrollCents: 500_000,
    dailyStopCents: 15_000, // 3% de R$ 5.000
    today: '2026-09-05',
    entries: [entry({ occurredOn: '2026-09-02', status: 'RED', stakeCents: 16_000, profitCents: -16_000 })],
    transactions: [],
  });
  assert.equal(series[1]!.status, 'STOP_HIT');
});

test('aportes e retiradas entram na banca real do dia, não no lucro', () => {
  const series = buildDailySeries({
    year: 2026,
    month: 9,
    monthlyGoalCents: 300_000,
    dailyGoalCents: 10_000,
    openingBankrollCents: 500_000,
    dailyStopCents: 15_000,
    today: '2026-09-05',
    entries: [entry({ occurredOn: '2026-09-01', profitCents: 10_000 })],
    transactions: [{ occurredOn: '2026-09-02', kind: 'CONTRIBUTION', amountCents: 100_000 }],
  });

  assert.equal(series[1]!.realBankrollCents, 610_000);
  assert.equal(series[1]!.cumulativeProfitCents, 10_000); // aporte não virou lucro
  assert.equal(series[1]!.differenceCents, -10_000);
});

// ===========================================================================
group('Controle de risco');
// ===========================================================================
test('stake máxima = 1% da banca (R$ 50 sobre R$ 5.000)', () => {
  const limits = computeRiskLimits(SETTINGS, {
    currentBankrollCents: 500_000,
    monthStartBankrollCents: 500_000,
    initialBankrollCents: 500_000,
  });
  assert.equal(limits.maxStakeCents, 5_000);
  assert.equal(limits.dailyStopCents, 15_000); // 3%
  assert.equal(limits.weeklyStopCents, 30_000); // 6%
  assert.equal(limits.monthlyStopCents, 50_000); // 10%
});

test('teto absoluto vence o percentual quando é menor', () => {
  const limits = computeRiskLimits(
    { ...SETTINGS, maxStakeCapCents: 4_000 },
    { currentBankrollCents: 500_000, monthStartBankrollCents: 500_000, initialBankrollCents: 500_000 },
  );
  assert.equal(limits.maxStakeCents, 4_000);
  assert.equal(limits.cappedByAbsolute, true);
});

test('stake acima do limite é bloqueada e explicada', () => {
  const check = checkStakeLimit({ stakeCents: 10_000, maxStakeCents: 5_000, policy: 'BLOCK' });
  assert.equal(check.level, 'BLOCK');
  assert.match(check.message ?? '', /ultrapassa o limite de risco configurado/);
  assert.equal(check.usageBps, 20_000);

  const warn = checkStakeLimit({ stakeCents: 10_000, maxStakeCents: 5_000, policy: 'WARN' });
  assert.equal(warn.level, 'WARN');

  const allowed = checkStakeLimit({ stakeCents: 5_000, maxStakeCents: 5_000, policy: 'BLOCK' });
  assert.equal(allowed.level, 'OK');
});

test('autorização do administrador libera, mas continua alertando', () => {
  const check = checkStakeLimit({
    stakeCents: 10_000,
    maxStakeCents: 5_000,
    policy: 'BLOCK',
    override: true,
  });
  assert.equal(check.level, 'WARN');
  assert.match(check.message ?? '', /autorização expressa/);
});

test('stops diário, semanal e mensal são avaliados de forma independente', () => {
  const limits = computeRiskLimits(SETTINGS, {
    currentBankrollCents: 500_000,
    monthStartBankrollCents: 500_000,
    initialBankrollCents: 500_000,
  });

  const stops = evaluateStops({
    limits,
    dayProfitCents: -15_000, // exatamente o stop diário
    weekProfitCents: -20_000,
    monthProfitCents: -20_000,
  });

  assert.equal(stops[0]!.isHit, true);
  assert.match(stops[0]!.message ?? '', /Stop diário atingido/);
  assert.equal(stops[1]!.isHit, false);
  assert.equal(stops[2]!.isHit, false);

  // Lucro no período nunca gera aviso de stop.
  const positive = evaluateStops({
    limits,
    dayProfitCents: 40_000,
    weekProfitCents: 40_000,
    monthProfitCents: 40_000,
  });
  assert.equal(positive.every((s) => !s.isHit && s.lossCents === 0), true);
});

test('avaliação completa bloqueia por stake e alerta por stop', () => {
  const limits = computeRiskLimits(SETTINGS, {
    currentBankrollCents: 500_000,
    monthStartBankrollCents: 500_000,
    initialBankrollCents: 500_000,
  });

  const evaluation = evaluateEntryRisk({
    stakeCents: 10_000,
    limits,
    settings: SETTINGS, // stake BLOCK, stop WARN
    dayProfitCents: -15_000,
    weekProfitCents: -15_000,
    monthProfitCents: -15_000,
  });

  assert.equal(evaluation.level, 'BLOCK');
  assert.equal(evaluation.blockingMessages.length, 1);
  assert.equal(evaluation.warningMessages.length >= 1, true);
});

test('o limite nunca cresce sozinho: a base é a configurada', () => {
  const onInitial = computeRiskLimits(
    { ...SETTINGS, riskBase: 'INITIAL' },
    { currentBankrollCents: 900_000, monthStartBankrollCents: 700_000, initialBankrollCents: 500_000 },
  );
  assert.equal(onInitial.maxStakeCents, 5_000); // segue R$ 5.000 de base

  const onMonthStart = computeRiskLimits(
    { ...SETTINGS, riskBase: 'MONTH_START' },
    { currentBankrollCents: 900_000, monthStartBankrollCents: 700_000, initialBankrollCents: 500_000 },
  );
  assert.equal(onMonthStart.maxStakeCents, 7_000);
});

// ===========================================================================
group('Sócios');
// ===========================================================================
const MEMBERS = [
  { id: 'a', displayName: 'Sócio A', shareBps: 2_500, initialContributionCents: 125_000, isActive: true },
  { id: 'b', displayName: 'Sócio B', shareBps: 2_500, initialContributionCents: 125_000, isActive: true },
  { id: 'c', displayName: 'Sócio C', shareBps: 2_500, initialContributionCents: 125_000, isActive: true },
  { id: 'd', displayName: 'Sócio D', shareBps: 2_500, initialContributionCents: 125_000, isActive: true },
];

test('participações precisam somar 100%', () => {
  const ok = computePartnerShares({ members: MEMBERS, profitCents: 0, transactions: [] });
  assert.equal(ok.totalShareBps, 10_000);
  assert.equal(ok.isShareValid, true);

  const broken = computePartnerShares({
    members: [...MEMBERS.slice(0, 3)],
    profitCents: 0,
    transactions: [],
  });
  assert.equal(broken.isShareValid, false);
  assert.equal(broken.totalShareBps, 7_500);
});

test('lucro é rateado sem perder centavos', () => {
  // R$ 100,01 em quatro partes iguais não divide certinho
  const parts = distributeByShares(10_001, [2_500, 2_500, 2_500, 2_500]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 10_001);
  assert.deepEqual(parts, [2_501, 2_500, 2_500, 2_500]);

  const negative = distributeByShares(-10_001, [2_500, 2_500, 2_500, 2_500]);
  assert.equal(negative.reduce((a, b) => a + b, 0), -10_001);
});

test('saldo do sócio soma capital e lucro separadamente', () => {
  const result = computePartnerShares({
    members: MEMBERS,
    profitCents: 100_000, // R$ 1.000 de lucro
    transactions: [
      { occurredOn: '2026-09-02', kind: 'CONTRIBUTION', amountCents: 50_000, memberId: 'a' },
      { occurredOn: '2026-09-10', kind: 'WITHDRAWAL', amountCents: 20_000, memberId: 'b' },
      { occurredOn: '2026-09-11', kind: 'CONTRIBUTION', amountCents: 30_000, memberId: null },
    ],
  });

  const a = result.partners.find((p) => p.memberId === 'a')!;
  assert.equal(a.profitShareCents, 25_000);
  assert.equal(a.contributionsCents, 50_000);
  assert.equal(a.totalInvestedCents, 175_000); // 125.000 + 50.000
  assert.equal(a.balanceCents, 200_000); // capital 175.000 + lucro 25.000

  const b = result.partners.find((p) => p.memberId === 'b')!;
  assert.equal(b.withdrawalsCents, 20_000);
  assert.equal(b.balanceCents, 130_000); // 125.000 − 20.000 + 25.000

  // Movimentação sem sócio não é atribuída a ninguém.
  assert.equal(result.unassignedContributionsCents, 30_000);
  assert.equal(
    result.partners.reduce((acc, p) => acc + p.contributionsCents, 0),
    50_000,
  );
});

test('prejuízo também é rateado proporcionalmente', () => {
  const result = computePartnerShares({ members: MEMBERS, profitCents: -40_000, transactions: [] });
  assert.equal(result.partners.every((p) => p.profitShareCents === -10_000), true);
  assert.equal(result.partners.reduce((acc, p) => acc + p.profitShareCents, 0), -40_000);
});

test('sugestão de participação segue o capital investido', () => {
  const suggestion = suggestSharesFromCapital([
    { id: 'a', investedCents: 300_000 },
    { id: 'b', investedCents: 100_000 },
  ]);
  assert.equal(suggestion.get('a'), 7_500);
  assert.equal(suggestion.get('b'), 2_500);
  assert.equal((suggestion.get('a') ?? 0) + (suggestion.get('b') ?? 0), 10_000);
});

// ===========================================================================
group('Estatísticas por integrante');
// ===========================================================================
test('ranking ordena por lucro, não por taxa de acerto', () => {
  const stats = computeMemberStats(
    [
      // Muitos greens de odd baixa, resultado pequeno
      entry({ memberId: 'a', status: 'GREEN', stakeCents: 10_000, profitCents: 1_000 }),
      entry({ memberId: 'a', status: 'GREEN', stakeCents: 10_000, profitCents: 1_000 }),
      entry({ memberId: 'a', status: 'RED', stakeCents: 10_000, profitCents: -10_000 }),
      // Poucos greens de odd alta, resultado maior
      entry({ memberId: 'b', status: 'GREEN', stakeCents: 10_000, profitCents: 40_000 }),
      entry({ memberId: 'b', status: 'RED', stakeCents: 10_000, profitCents: -10_000 }),
      entry({ memberId: 'b', status: 'RED', stakeCents: 10_000, profitCents: -10_000 }),
    ],
    [
      { id: 'a', displayName: 'A' },
      { id: 'b', displayName: 'B' },
    ],
  );

  assert.equal(stats[0]!.memberId, 'b'); // maior lucro vem primeiro
  assert.equal(stats[0]!.profitCents, 20_000);
  assert.equal(stats[0]!.hitRateBps, 3_333); // apesar de 33% de acerto
  assert.equal(stats[1]!.memberId, 'a');
  assert.equal(stats[1]!.profitCents, -8_000);
  assert.equal(stats[1]!.hitRateBps, 6_667); // 67% de acerto e prejuízo
});

// ===========================================================================
group('Fechamento mensal');
// ===========================================================================
test('fotografia do mês fecha a conta e distribui por sócio', () => {
  const snapshot = buildMonthlyClosing({
    year: 2026,
    month: 9,
    openingBankrollCents: 500_000,
    goalCents: 300_000,
    dailyGoalCents: 10_000,
    activeDays: 30,
    targetBankrollCents: 800_000,
    members: MEMBERS,
    entries: [
      entry({ status: 'GREEN', stakeCents: 5_000, profitCents: 5_750, oddMilli: 2_150 }),
      entry({ status: 'RED', stakeCents: 5_000, profitCents: -5_000 }),
      entry({ status: 'GREEN', stakeCents: 5_000, profitCents: 4_000 }),
      entry({ status: 'VOID', stakeCents: 5_000, profitCents: 0 }),
    ],
    transactions: [
      { occurredOn: '2026-09-05', kind: 'CONTRIBUTION', amountCents: 100_000, memberId: 'a' },
      { occurredOn: '2026-09-20', kind: 'WITHDRAWAL', amountCents: 40_000, memberId: 'b' },
    ],
  });

  assert.equal(snapshot.entriesProfitCents, 4_750);
  assert.equal(snapshot.contributionsCents, 100_000);
  assert.equal(snapshot.withdrawalsCents, 40_000);
  // Banca final = 500.000 + 4.750 + 100.000 − 40.000
  assert.equal(snapshot.closingBankrollCents, 564_750);
  assert.equal(snapshot.totalStakedCents, 15_000); // VOID fora
  assert.equal(snapshot.greens, 2);
  assert.equal(snapshot.reds, 1);
  assert.equal(snapshot.voids, 1);
  assert.equal(snapshot.hitRateBps, 6_667);
  assert.equal(snapshot.roiBps, 3_167); // 4.750 / 15.000
  assert.equal(snapshot.goalProgressBps, 158); // 1,58% da meta
  assert.equal(snapshot.partners.length, 4);
  assert.equal(
    snapshot.partners.reduce((acc, p) => acc + p.profitShareCents, 0),
    snapshot.entriesProfitCents,
  );

  const partnerA = snapshot.partners.find((p) => p.memberId === 'a')!;
  assert.equal(partnerA.contributionsCents, 100_000);
  assert.equal(partnerA.balanceCents, 225_000 + partnerA.profitShareCents);
});

test('o snapshot é independente de mudanças futuras nas configurações', () => {
  const base = {
    year: 2026,
    month: 9,
    openingBankrollCents: 500_000,
    dailyGoalCents: 10_000,
    activeDays: 30,
    targetBankrollCents: 800_000,
    members: MEMBERS,
    entries: [entry({ status: 'GREEN', stakeCents: 5_000, profitCents: 5_000 })],
    transactions: [],
  };

  const closed = buildMonthlyClosing({ ...base, goalCents: 300_000 });
  const snapshotJson = JSON.stringify(closed);

  // Uma mudança posterior de meta produz outro cálculo, mas o objeto já gravado
  // permanece exatamente como estava — é isso que a página de histórico exibe.
  const afterChange = buildMonthlyClosing({ ...base, goalCents: 600_000 });
  assert.notEqual(afterChange.goalProgressBps, closed.goalProgressBps);
  assert.equal(JSON.stringify(closed), snapshotJson);
});

// ===========================================================================
group('Autenticação');
// ===========================================================================
test('senha é armazenada com scrypt e verificada corretamente', async () => {
  const hash = await hashPassword('Banca@2026');
  assert.match(hash, /^scrypt\$/);
  assert.equal(await verifyPassword('Banca@2026', hash), true);
  assert.equal(await verifyPassword('senha errada', hash), false);

  // Dois hashes da mesma senha são diferentes (salt aleatório).
  assert.notEqual(hash, await hashPassword('Banca@2026'));
});

test('senha curta é recusada no hash; a senha escolhida ainda exige 8 no schema', async () => {
  // Baixo nível: aceita a senha padrão do sistema (curta, temporária, trocada
  // no primeiro acesso), mas recusa qualquer coisa menor que o mínimo.
  await assert.rejects(() => hashPassword('12345'), /pelo menos 6 caracteres/);
  assert.match(await hashPassword(defaultUserPassword()), /^scrypt\$/);

  // Toda senha ESCOLHIDA por uma pessoa passa pelo Zod, que exige 8.
  const short = changePasswordSchema.safeParse({
    currentPassword: 'FZN2026',
    newPassword: 'abc1234',
    confirmPassword: 'abc1234',
  });
  assert.equal(short.success, false);
  assert.match(JSON.stringify(short.error?.issues), /pelo menos 8 caracteres/);

  const ok = changePasswordSchema.safeParse({
    currentPassword: 'FZN2026',
    newPassword: 'senhaNova1',
    confirmPassword: 'senhaNova1',
  });
  assert.equal(ok.success, true);
});

test('token de sessão é assinado e validado', async () => {
  const secret = 'segredo-de-teste-com-tamanho-suficiente';
  const token = await signSessionToken({ sub: 'u1', bid: 'b1', role: 'ADMIN', tv: 1 }, secret, 3_600);

  const claims = await verifySessionToken(token, secret);
  assert.equal(claims?.sub, 'u1');
  assert.equal(claims?.role, 'ADMIN');

  // Assinatura com outro segredo não passa.
  assert.equal(await verifySessionToken(token, 'outro-segredo-completamente-diferente'), null);

  // Payload adulterado não passa.
  const [header, , signature] = token.split('.') as [string, string, string];
  const forged = `${header}.${Buffer.from(JSON.stringify({ sub: 'u2', bid: 'b1', role: 'ADMIN', tv: 1, exp: 9_999_999_999 })).toString('base64url')}.${signature}`;
  assert.equal(await verifySessionToken(forged, secret), null);
});

test('token expirado é rejeitado', async () => {
  const secret = 'segredo-de-teste-com-tamanho-suficiente';
  const token = await signSessionToken({ sub: 'u1', bid: 'b1', role: 'PARTNER', tv: 1 }, secret, -10);
  assert.equal(await verifySessionToken(token, secret), null);
});

void run();
