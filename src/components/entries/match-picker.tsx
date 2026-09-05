'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { IconCalendar, IconCheck, IconClose, IconSearch } from '@/components/icons';

/** Jogo oferecido para seleção, vindo do calendário já guardado no banco. */
export interface MatchOption {
  id: string;
  home: string;
  away: string;
  league: string;
  /** 'HH:MM' no fuso da banca. */
  time: string;
  day: 'hoje' | 'amanhã' | string;
  live: boolean;
}

export function matchLabel(match: MatchOption): string {
  return `${match.home} x ${match.away}`;
}

/**
 * Escolha de jogos do dia.
 *
 * Marcar mais de um monta uma múltipla: o campo de evento passa a listar
 * todos os jogos selecionados. Quem preferir digitar é livre para ignorar
 * este seletor — ele só preenche o campo.
 */
export function MatchPicker({
  matches,
  selected,
  onChange,
}: {
  matches: readonly MatchOption[];
  selected: readonly MatchOption[];
  onChange: (next: MatchOption[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const term = search
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}+/gu, '');
    if (!term) return matches;
    return matches.filter((match) =>
      `${match.home} ${match.away} ${match.league}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}+/gu, '')
        .includes(term),
    );
  }, [matches, search]);

  const isSelected = (id: string) => selected.some((match) => match.id === id);

  const toggle = (match: MatchOption) => {
    onChange(isSelected(match.id) ? selected.filter((m) => m.id !== match.id) : [...selected, match]);
  };

  if (matches.length === 0) {
    return (
      <p className="text-xs text-ink-faint">
        Nenhum jogo carregado para hoje. Digite o evento à mão, ou abra a aba Dicas para o sistema
        buscar o calendário.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant={open ? 'primary' : 'secondary'} size="sm" onClick={() => setOpen((v) => !v)}>
          <IconCalendar />
          {open ? 'Fechar lista' : `Escolher jogo (${matches.length})`}
        </Button>
        {selected.length > 0 ? (
          <>
            <span className="text-xs font-bold text-accent">
              {selected.length === 1 ? '1 jogo selecionado' : `múltipla de ${selected.length} jogos`}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
              limpar
            </Button>
          </>
        ) : null}
      </div>

      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((match) => (
            <li key={match.id}>
              <button
                type="button"
                onClick={() => toggle(match)}
                className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/12 px-2.5 py-1 text-xs font-bold text-accent transition-colors hover:bg-accent/20"
                aria-label={`Remover ${matchLabel(match)}`}
              >
                {matchLabel(match)}
                <IconClose className="text-[11px]" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div className="rounded-md border border-line bg-elevated/50 p-2.5">
          <div className="relative mb-2">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar time ou campeonato"
              className="pl-9"
              autoFocus
            />
          </div>

          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-ink-faint">Nenhum jogo encontrado.</li>
            ) : (
              filtered.map((match) => {
                const active = isSelected(match.id);
                return (
                  <li key={match.id}>
                    <button
                      type="button"
                      onClick={() => toggle(match)}
                      aria-pressed={active}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors',
                        active
                          ? 'border-accent/40 bg-accent/12'
                          : 'border-transparent hover:border-line-strong hover:bg-surface',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[10px]',
                          active ? 'border-accent bg-accent text-ink-invert' : 'border-line-strong',
                        )}
                        aria-hidden="true"
                      >
                        {active ? <IconCheck /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-ink">{matchLabel(match)}</span>
                        <span className="block truncate text-xs text-ink-faint">
                          {match.league} · {match.live ? 'ao vivo' : `${match.day} ${match.time}`}
                        </span>
                      </span>
                      {match.live ? (
                        <span className="shrink-0 rounded-sm bg-accent/15 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-accent">
                          ao vivo
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
