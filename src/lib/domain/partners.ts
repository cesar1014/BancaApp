import type { Cents } from '@/lib/money';
import type { Bps } from '@/lib/numbers';
import { BPS_DENOMINATOR } from '@/lib/numbers';
import type { Member } from './types';
import type { TransactionLike } from './metrics';

/**
 * Participação dos sócios.
 *
 * Regra central: APORTE NÃO É LUCRO. O saldo teórico de um sócio soma o que
 * ele colocou (aporte inicial + aportes) menos o que retirou, e soma à parte
 * a fatia dele no lucro das entradas. Os dois nunca se misturam.
 */

export interface PartnerShareInput {
  members: readonly Pick<
    Member,
    'id' | 'displayName' | 'shareBps' | 'initialContributionCents' | 'isActive'
  >[];
  /** Lucro das entradas no período considerado (pode ser negativo). */
  profitCents: Cents;
  transactions: readonly TransactionLike[];
}

export interface PartnerShare {
  memberId: string;
  displayName: string;
  shareBps: Bps;
  isActive: boolean;
  initialContributionCents: Cents;
  contributionsCents: Cents;
  withdrawalsCents: Cents;
  /** Fatia do lucro das entradas, proporcional à participação. */
  profitShareCents: Cents;
  /** Aporte inicial + aportes − retiradas + fatia do lucro. */
  balanceCents: Cents;
  /** Total efetivamente colocado por este sócio (nunca somado ao lucro). */
  totalInvestedCents: Cents;
}

export interface PartnerSharesResult {
  partners: PartnerShare[];
  totalShareBps: Bps;
  isShareValid: boolean;
  /** Movimentações sem sócio vinculado — não entram no saldo de ninguém. */
  unassignedContributionsCents: Cents;
  unassignedWithdrawalsCents: Cents;
}

/**
 * Distribui um valor entre participações em bps sem perder nem criar
 * centavos: reparte pelo piso e devolve as sobras pelo método do maior resto.
 */
export function distributeByShares(totalCents: Cents, sharesBps: readonly Bps[]): Cents[] {
  const totalBps = sharesBps.reduce((acc, bps) => acc + bps, 0);
  if (sharesBps.length === 0 || totalBps <= 0) return sharesBps.map(() => 0);

  const sign = totalCents < 0 ? -1 : 1;
  const magnitude = Math.abs(totalCents);

  const exact = sharesBps.map((bps) => (magnitude * bps) / totalBps);
  const floors = exact.map((value) => Math.floor(value));
  let distributed = floors.reduce((acc, value) => acc + value, 0);

  const remainders = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);

  let cursor = 0;
  while (distributed < magnitude && remainders.length > 0) {
    const target = remainders[cursor % remainders.length];
    if (target) {
      floors[target.index] = (floors[target.index] ?? 0) + 1;
      distributed += 1;
    }
    cursor += 1;
  }

  return floors.map((value) => value * sign);
}

export function computePartnerShares(input: PartnerShareInput): PartnerSharesResult {
  const contributionsByMember = new Map<string, Cents>();
  const withdrawalsByMember = new Map<string, Cents>();
  let unassignedContributionsCents = 0;
  let unassignedWithdrawalsCents = 0;

  for (const tx of input.transactions) {
    const memberId = tx.memberId ?? null;
    if (memberId === null) {
      if (tx.kind === 'CONTRIBUTION') unassignedContributionsCents += tx.amountCents;
      else unassignedWithdrawalsCents += tx.amountCents;
      continue;
    }
    const target = tx.kind === 'CONTRIBUTION' ? contributionsByMember : withdrawalsByMember;
    target.set(memberId, (target.get(memberId) ?? 0) + tx.amountCents);
  }

  const shares = input.members.map((member) => member.shareBps);
  const profitShares = distributeByShares(input.profitCents, shares);
  const totalShareBps = shares.reduce((acc, bps) => acc + bps, 0);

  const partners: PartnerShare[] = input.members.map((member, index) => {
    const contributionsCents = contributionsByMember.get(member.id) ?? 0;
    const withdrawalsCents = withdrawalsByMember.get(member.id) ?? 0;
    const profitShareCents = profitShares[index] ?? 0;
    const totalInvestedCents = member.initialContributionCents + contributionsCents;

    return {
      memberId: member.id,
      displayName: member.displayName,
      shareBps: member.shareBps,
      isActive: member.isActive,
      initialContributionCents: member.initialContributionCents,
      contributionsCents,
      withdrawalsCents,
      profitShareCents,
      balanceCents: totalInvestedCents - withdrawalsCents + profitShareCents,
      totalInvestedCents,
    };
  });

  return {
    partners,
    totalShareBps,
    isShareValid: totalShareBps === BPS_DENOMINATOR,
    unassignedContributionsCents,
    unassignedWithdrawalsCents,
  };
}

/**
 * Sugestão de participação proporcional ao capital efetivamente investido.
 * É apenas uma sugestão exibida ao administrador: nada é aplicado sozinho.
 */
export function suggestSharesFromCapital(
  members: readonly { id: string; investedCents: Cents }[],
): Map<string, Bps> {
  const total = members.reduce((acc, m) => acc + Math.max(m.investedCents, 0), 0);
  const result = new Map<string, Bps>();
  if (total <= 0) {
    for (const member of members) result.set(member.id, 0);
    return result;
  }

  const exact = members.map((m) => (Math.max(m.investedCents, 0) * BPS_DENOMINATOR) / total);
  const floors = exact.map((v) => Math.floor(v));
  let distributed = floors.reduce((acc, v) => acc + v, 0);
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);

  let cursor = 0;
  while (distributed < BPS_DENOMINATOR && order.length > 0) {
    const target = order[cursor % order.length];
    if (target) {
      floors[target.index] = (floors[target.index] ?? 0) + 1;
      distributed += 1;
    }
    cursor += 1;
  }

  members.forEach((member, index) => result.set(member.id, floors[index] ?? 0));
  return result;
}
