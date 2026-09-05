/**
 * Distribuição de Poisson — base do modelo de gols, escanteios e cartões.
 * Puro, sem dependências.
 */

const FACTORIAL_CACHE = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];

function factorial(n: number): number {
  if (n < FACTORIAL_CACHE.length) return FACTORIAL_CACHE[n]!;
  let value = FACTORIAL_CACHE[FACTORIAL_CACHE.length - 1]!;
  for (let i = FACTORIAL_CACHE.length; i <= n; i += 1) value *= i;
  return value;
}

/** P(X = k) para X ~ Poisson(λ). */
export function poissonPmf(k: number, lambda: number): number {
  if (k < 0 || lambda < 0) return 0;
  if (lambda === 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * lambda ** k) / factorial(k);
}

/** P(X ≤ k). */
export function poissonCdf(k: number, lambda: number): number {
  if (k < 0) return 0;
  let total = 0;
  for (let i = 0; i <= k; i += 1) total += poissonPmf(i, lambda);
  return Math.min(1, total);
}

/** P(X ≥ k). */
export function poissonAtLeast(k: number, lambda: number): number {
  if (k <= 0) return 1;
  return Math.max(0, 1 - poissonCdf(k - 1, lambda));
}

export interface OutcomeProbabilities {
  homeWin: number;
  draw: number;
  awayWin: number;
}

/**
 * Probabilidades de resultado final dado o placar atual e os gols esperados
 * restantes de cada lado (independentes).
 */
export function matchOutcomeProbabilities(
  currentHome: number,
  currentAway: number,
  lambdaHome: number,
  lambdaAway: number,
  maxGoals = 8,
): OutcomeProbabilities {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  for (let h = 0; h <= maxGoals; h += 1) {
    const ph = poissonPmf(h, lambdaHome);
    for (let a = 0; a <= maxGoals; a += 1) {
      const p = ph * poissonPmf(a, lambdaAway);
      const finalHome = currentHome + h;
      const finalAway = currentAway + a;
      if (finalHome > finalAway) homeWin += p;
      else if (finalHome === finalAway) draw += p;
      else awayWin += p;
    }
  }

  const total = homeWin + draw + awayWin;
  if (total <= 0) return { homeWin: 1 / 3, draw: 1 / 3, awayWin: 1 / 3 };
  return { homeWin: homeWin / total, draw: draw / total, awayWin: awayWin / total };
}
