import type { Cents } from '@/lib/money';
import type { Bps } from '@/lib/numbers';
import type { EntriesSummary, EntryLike } from './metrics';
import { summarizeEntries } from './metrics';

export interface MemberStats extends EntriesSummary {
  memberId: string;
  displayName: string;
}

/**
 * Estatísticas por integrante.
 *
 * A ordenação padrão é por LUCRO, não por taxa de acerto: uma taxa de acerto
 * alta com odds baixas pode dar prejuízo, e uma taxa baixa com odds altas pode
 * dar lucro. A taxa de acerto é exibida como contexto, nunca como ranking.
 */
export function computeMemberStats(
  entries: readonly (EntryLike & { memberId: string; oddMilli?: number })[],
  members: readonly { id: string; displayName: string }[],
): MemberStats[] {
  const byMember = new Map<string, (EntryLike & { oddMilli?: number })[]>();
  for (const entry of entries) {
    const list = byMember.get(entry.memberId);
    if (list) list.push(entry);
    else byMember.set(entry.memberId, [entry]);
  }

  return members
    .map((member) => ({
      memberId: member.id,
      displayName: member.displayName,
      ...summarizeEntries(byMember.get(member.id) ?? []),
    }))
    .sort((a, b) => b.profitCents - a.profitCents || b.count - a.count);
}

export interface BreakdownRow {
  key: string;
  label: string;
  count: number;
  stakeCents: Cents;
  profitCents: Cents;
  roiBps: Bps | null;
  greens: number;
  reds: number;
  hitRateBps: Bps | null;
}

/** Agrupa entradas por uma dimensão qualquer (esporte, mercado, etc.). */
export function breakdownBy<T extends EntryLike & { oddMilli?: number }>(
  entries: readonly T[],
  keyOf: (entry: T) => string,
  labelOf: (key: string) => string = (key) => key,
): BreakdownRow[] {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }

  return Array.from(groups.entries())
    .map(([key, list]) => {
      const summary = summarizeEntries(list);
      return {
        key,
        label: labelOf(key),
        count: summary.count,
        stakeCents: summary.totalStakeVolumeCents,
        profitCents: summary.profitCents,
        roiBps: summary.roiBps,
        greens: summary.greens,
        reds: summary.reds,
        hitRateBps: summary.hitRateBps,
      };
    })
    .sort((a, b) => b.profitCents - a.profitCents || b.count - a.count);
}

export const ODD_BANDS: readonly { key: string; label: string; min: number; max: number }[] = [
  { key: 'ate-1.50', label: 'Até 1,50', min: 0, max: 1500 },
  { key: '1.51-2.00', label: '1,51 – 2,00', min: 1501, max: 2000 },
  { key: '2.01-3.00', label: '2,01 – 3,00', min: 2001, max: 3000 },
  { key: '3.01-5.00', label: '3,01 – 5,00', min: 3001, max: 5000 },
  { key: 'acima-5.00', label: 'Acima de 5,00', min: 5001, max: Number.MAX_SAFE_INTEGER },
];

export function oddBandKey(oddMilli: number): string {
  return ODD_BANDS.find((band) => oddMilli >= band.min && oddMilli <= band.max)?.key ?? 'outros';
}

export function oddBandLabel(key: string): string {
  return ODD_BANDS.find((band) => band.key === key)?.label ?? key;
}
