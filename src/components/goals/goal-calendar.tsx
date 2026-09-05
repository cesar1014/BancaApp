import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';
import { Result } from '@/components/ui/money';
import type { DailyRow } from '@/lib/domain/goals';

/**
 * Calendário do mês: uma célula por dia, meta × realizado.
 *
 * É a leitura de relance do mês inteiro — no celular ela substitui a tabela de
 * nove colunas, que só faz sentido no desktop. Cada célula tem uma barra cuja
 * largura é o resultado do dia medido contra a meta diária, então o mês inteiro
 * se lê como um padrão, sem precisar comparar números um a um.
 */
export function GoalCalendar({ rows }: { rows: readonly DailyRow[] }) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {rows.map((row) => {
        const day = row.date.slice(8, 10);
        const hasResult = !row.isFuture && row.entriesCount > 0;
        const goal = Math.max(row.dailyGoalCents, 1);
        const fillBps = hasResult
          ? Math.min(Math.round((Math.abs(row.dayProfitCents) / goal) * 10_000), 10_000)
          : 0;
        const isLoss = row.dayProfitCents < 0;

        return (
          <li
            key={row.date}
            className={cn(
              'rounded-md border p-3 transition-colors',
              row.isToday
                ? 'border-accent bg-accent/[0.07]'
                : 'border-line bg-elevated/45 hover:border-line-strong',
              row.isFuture && 'opacity-45',
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-num-md font-extrabold tnum text-ink">{day}</span>
              <span className="lbl">{row.isToday ? 'Hoje' : row.weekday}</span>
            </div>

            <p className="mt-2 text-[15px] font-extrabold tnum">
              {hasResult ? (
                <Result cents={row.dayProfitCents} />
              ) : (
                <span className="text-ink-faint">
                  {row.isFuture ? '—' : 'sem entradas'}
                </span>
              )}
            </p>

            <div
              className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-sunken"
              aria-hidden="true"
            >
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-700 ease-placar',
                  isLoss ? 'bg-negative' : 'bg-accent',
                )}
                style={{ width: `${fillBps / 100}%` }}
              />
            </div>

            <p className="mt-2 text-[11px] tnum text-ink-faint">
              meta {formatMoney(row.dailyGoalCents)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
