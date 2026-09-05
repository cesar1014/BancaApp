'use client';

import { cn } from '@/lib/cn';

/**
 * Fileira de botões de escolha rápida. Serve para esporte e mercado: um
 * toque em vez de digitar, com o campo de texto continuando disponível para
 * qualquer valor fora da lista.
 */
export function QuickPicks({
  options,
  value,
  onPick,
  ariaLabel,
}: {
  options: readonly string[];
  value: string;
  onPick: (option: string) => void;
  ariaLabel: string;
}) {
  const normalized = value.trim().toLowerCase();
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = normalized === option.toLowerCase();
        return (
          <button
            key={option}
            type="button"
            onClick={() => onPick(active ? '' : option)}
            aria-pressed={active}
            className={cn(
              'min-h-[34px] rounded-full border px-3 text-xs font-bold transition-colors',
              active
                ? 'border-accent/45 bg-accent/15 text-accent'
                : 'border-line bg-elevated text-ink-muted hover:border-line-strong hover:text-ink',
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export const SPORTS: readonly string[] = ['Futebol', 'Basquete', 'Tênis', 'e-Sports', 'Vôlei', 'MMA'];

export const MARKETS: readonly string[] = [
  'Over 0.5 gols',
  'Over 1.5 gols',
  'Over 2.5 gols',
  'Under 2.5 gols',
  'Ambas marcam',
  'Casa vence',
  'Fora vence',
  'Dupla chance',
  'Escanteios',
  'Cartões',
];
