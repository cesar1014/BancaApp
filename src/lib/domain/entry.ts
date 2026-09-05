import type { Cents } from '@/lib/money';
import type { OddMilli } from '@/lib/numbers';
import { ODD_DENOMINATOR } from '@/lib/numbers';
import type { EntryStatus } from './types';

/**
 * Regras de resultado de uma entrada. Esta é a ÚNICA fonte de verdade do
 * lucro; o valor nunca vem do frontend e é recalculado no servidor a cada
 * gravação. O CHECK em `entries` no banco replica exatamente estas regras.
 *
 *   GREEN   -> lucro = stake × (odd − 1)   | retorno = stake + lucro
 *   RED     -> lucro = −stake              | retorno = 0
 *   VOID    -> lucro = 0                   | retorno = stake (devolvido)
 *   CASHOUT -> lucro = retorno − stake     | retorno informado pelo usuário
 *   ABERTA  -> lucro = 0                   | retorno = 0 (ainda não resolvida)
 */

export interface EntryResultInput {
  status: EntryStatus;
  stakeCents: Cents;
  oddMilli: OddMilli;
  /** Obrigatório apenas para CASHOUT. */
  payoutCents?: Cents | null;
}

export interface EntryResult {
  profitCents: Cents;
  payoutCents: Cents;
}

export function computeEntryResult(input: EntryResultInput): EntryResult {
  const { status, stakeCents, oddMilli } = input;

  if (!Number.isInteger(stakeCents) || stakeCents <= 0) {
    throw new Error('Stake deve ser um valor positivo em centavos.');
  }
  if (!Number.isInteger(oddMilli) || oddMilli <= ODD_DENOMINATOR) {
    throw new Error('Odd deve ser maior que 1,00.');
  }

  switch (status) {
    case 'OPEN':
      return { profitCents: 0, payoutCents: 0 };

    case 'GREEN': {
      const profitCents = Math.round((stakeCents * (oddMilli - ODD_DENOMINATOR)) / ODD_DENOMINATOR);
      return { profitCents, payoutCents: stakeCents + profitCents };
    }

    case 'RED':
      return { profitCents: -stakeCents, payoutCents: 0 };

    case 'VOID':
      return { profitCents: 0, payoutCents: stakeCents };

    case 'CASHOUT': {
      const payoutCents = input.payoutCents ?? null;
      if (payoutCents === null || !Number.isInteger(payoutCents) || payoutCents < 0) {
        throw new Error('Informe o retorno do cashout (valor recebido ao encerrar a aposta).');
      }
      return { profitCents: payoutCents - stakeCents, payoutCents };
    }

    default: {
      const exhaustive: never = status;
      throw new Error(`Status desconhecido: ${String(exhaustive)}`);
    }
  }
}

/** Retorno potencial de uma entrada em aberto (stake × odd). */
export function potentialReturnCents(stakeCents: Cents, oddMilli: OddMilli): Cents {
  return Math.round((stakeCents * oddMilli) / ODD_DENOMINATOR);
}

/** Lucro potencial de uma entrada em aberto. */
export function potentialProfitCents(stakeCents: Cents, oddMilli: OddMilli): Cents {
  return potentialReturnCents(stakeCents, oddMilli) - stakeCents;
}

/** Entradas resolvidas movimentam a banca; entradas abertas, não. */
export function isSettled(status: EntryStatus): boolean {
  return status !== 'OPEN';
}

/**
 * Entradas que contam como "dinheiro efetivamente arriscado" para ROI.
 * VOID é excluído porque a stake foi devolvida integralmente.
 */
export function countsForTurnover(status: EntryStatus): boolean {
  return status === 'GREEN' || status === 'RED' || status === 'CASHOUT';
}
