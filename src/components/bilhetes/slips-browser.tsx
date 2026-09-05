'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { SlipCard, SlipListEmpty } from './slip-card';
import { formatDateBR, weekdayShort } from '@/lib/datetime';
import type { SlipView } from '@/lib/services/bilhetes.service';

/**
 * Filtro por faixa de odd e ordenação da lista de bilhetes.
 *
 * A ordenação padrão é por CHANCE ESTIMADA, não por odd. As duas coisas não
 * são equivalentes: a odd implícita já vem inflada pela margem da casa, e numa
 * múltipla essa margem se acumula perna a perna. Uma múltipla de 3 pernas a
 * 10,00 tem chance real melhor do que uma de 8 pernas a 10,00, porque embute
 * muito menos margem. Quem quiser a leitura crua ainda pode ordenar por odd.
 *
 * Tudo acontece no cliente: a lista do dia é pequena e assim o filtro responde
 * na hora, sem recarregar a página.
 */

interface OddRange {
  key: string;
  label: string;
  /** Limites em milli; null = sem limite naquele lado. */
  min: number | null;
  max: number | null;
}

const ODD_RANGES: readonly OddRange[] = [
  { key: 'ALL', label: 'Todas', min: null, max: null },
  { key: 'A', label: 'até 3,00', min: null, max: 3_000 },
  { key: 'B', label: '3,00 a 6,00', min: 3_000, max: 6_000 },
  { key: 'C', label: '6,00 a 10,00', min: 6_000, max: 10_000 },
  { key: 'D', label: '10,00 a 20,00', min: 10_000, max: 20_000 },
  { key: 'E', label: 'acima de 20,00', min: 20_000, max: null },
];

type SortKey = 'PROBABILITY' | 'ODD_DESC' | 'ODD_ASC' | 'SOURCE';

const SORTS: readonly { key: SortKey; label: string; hint: string }[] = [
  { key: 'PROBABILITY', label: 'Mais chance de bater', hint: 'chance estimada depois de descontar a margem de cada perna' },
  { key: 'ODD_DESC', label: 'Maior odd', hint: 'maior retorno potencial primeiro' },
  { key: 'ODD_ASC', label: 'Menor odd', hint: 'menor retorno potencial primeiro' },
  { key: 'SOURCE', label: 'Ranking das fontes', hint: 'fontes com melhor ROI histórico primeiro' },
];

export function SlipsBrowser({
  slips,
  timezone,
  canManage,
  showDate = false,
  groupByDate = false,
  emptyReason,
}: {
  slips: SlipView[];
  timezone: string;
  canManage: boolean;
  showDate?: boolean;
  /** Em "Próximos" os bilhetes ficam separados por dia; o filtro age antes. */
  groupByDate?: boolean;
  emptyReason: string | null;
}) {
  const [rangeKey, setRangeKey] = useState('ALL');
  const [sort, setSort] = useState<SortKey>('PROBABILITY');

  const range = ODD_RANGES.find((r) => r.key === rangeKey) ?? ODD_RANGES[0]!;

  const visible = useMemo(() => {
    const filtered = slips.filter((slip) => {
      if (range.min === null && range.max === null) return true;
      const odd = slip.filterOddMilli;
      // Bilhete sem odd nenhuma não tem como ser filtrado por faixa: sai da
      // lista quando há filtro, em vez de aparecer numa faixa que não é a dele.
      if (odd === null) return false;
      if (range.min !== null && odd < range.min) return false;
      if (range.max !== null && odd > range.max) return false;
      return true;
    });

    // A ordem que chega do servidor já é o ranking das fontes.
    if (sort === 'SOURCE') return filtered;

    return [...filtered].sort((a, b) => {
      if (sort === 'PROBABILITY') {
        // Sem estimativa vai para o fim: não dá para prometer o que não se sabe.
        const pa = a.probability?.probabilityBps ?? -1;
        const pb = b.probability?.probabilityBps ?? -1;
        if (pa !== pb) return pb - pa;
        return (a.filterOddMilli ?? Infinity) - (b.filterOddMilli ?? Infinity);
      }
      const oa = a.filterOddMilli;
      const ob = b.filterOddMilli;
      if (oa === null && ob === null) return 0;
      if (oa === null) return 1;
      if (ob === null) return -1;
      return sort === 'ODD_DESC' ? ob - oa : oa - ob;
    });
  }, [slips, range, sort]);

  const hidden = slips.length - visible.length;
  const activeSort = SORTS.find((s) => s.key === sort)!;

  return (
    <>
      <div className="mb-4 space-y-3 rounded-lg border border-line bg-elevated/40 px-4 py-3.5">
        <Row label="Ordenar por">
          {SORTS.map((option) => (
            <Chip
              key={option.key}
              active={sort === option.key}
              onClick={() => setSort(option.key)}
              title={option.hint}
            >
              {option.label}
            </Chip>
          ))}
        </Row>

        <Row label="Faixa de odd">
          {ODD_RANGES.map((option) => (
            <Chip key={option.key} active={rangeKey === option.key} onClick={() => setRangeKey(option.key)}>
              {option.label}
            </Chip>
          ))}
        </Row>

        <p className="text-2xs text-ink-faint">
          {activeSort.hint}
          {hidden > 0 ? ` · ${hidden} bilhete${hidden === 1 ? '' : 's'} fora da faixa` : ''}
        </p>
      </div>

      {visible.length === 0 ? (
        <SlipListEmpty
          reason={
            slips.length === 0
              ? (emptyReason ?? 'As fontes não publicaram bilhetes para hoje.')
              : 'Nenhum bilhete nesta faixa de odd. Escolha outra faixa ou volte para "Todas".'
          }
        />
      ) : groupByDate ? (
        <div className="space-y-6">
          {groupSlipsByDate(visible).map(([date, group]) => (
            <section key={date}>
              <h2 className="lbl mb-3">
                {weekdayShort(date)} {formatDateBR(date)} · {group.length}
              </h2>
              <SlipGrid slips={group} timezone={timezone} canManage={canManage} showDate={false} />
            </section>
          ))}
        </div>
      ) : (
        <SlipGrid slips={visible} timezone={timezone} canManage={canManage} showDate={showDate} />
      )}
    </>
  );
}

/** Mantém a ordem já escolhida: o primeiro bilhete de cada dia define a ordem dos dias. */
function groupSlipsByDate(slips: readonly SlipView[]): [string, SlipView[]][] {
  const groups = new Map<string, SlipView[]>();
  for (const slip of slips) {
    const list = groups.get(slip.referenceDate);
    if (list) list.push(slip);
    else groups.set(slip.referenceDate, [slip]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function SlipGrid({
  slips,
  timezone,
  canManage,
  showDate,
}: {
  slips: readonly SlipView[];
  timezone: string;
  canManage: boolean;
  showDate: boolean;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {slips.map((slip) => (
        <SlipCard key={slip.id} slip={slip} timezone={timezone} canManage={canManage} showDate={showDate} />
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="lbl shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        'min-h-[32px] rounded-full border px-3 text-xs font-bold transition-colors',
        active
          ? 'border-accent/45 bg-accent/15 text-accent'
          : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
