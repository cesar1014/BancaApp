'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { IconChevronLeft, IconChevronRight } from '@/components/icons';
import { formatMonthLabel, nextMonth, previousMonth } from '@/lib/datetime';

/**
 * Navegação de mês por querystring (?ano=&mes=). Mantém a página como Server
 * Component: mudar de mês é uma navegação, não estado no cliente.
 */
export function MonthPicker({
  year,
  month,
  maxYear,
  maxMonth,
}: {
  year: number;
  month: number;
  maxYear?: number;
  maxMonth?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const go = (target: { year: number; month: number }) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('ano', String(target.year));
    params.set('mes', String(target.month));
    router.push(`${pathname}?${params.toString()}`);
  };

  const next = nextMonth(year, month);
  const atMax =
    maxYear !== undefined &&
    maxMonth !== undefined &&
    (next.year > maxYear || (next.year === maxYear && next.month > maxMonth));

  return (
    <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => go(previousMonth(year, month))}
        aria-label="Mês anterior"
      >
        <IconChevronLeft />
      </Button>
      <span className="min-w-[8.5rem] text-center text-sm font-medium text-ink">
        {formatMonthLabel(year, month)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => go(next)}
        disabled={atMax}
        aria-label="Próximo mês"
      >
        <IconChevronRight />
      </Button>
    </div>
  );
}
