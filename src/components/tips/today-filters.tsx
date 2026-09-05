'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Field, Select } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { MARKET_KEYS, MARKET_LABEL } from '@/lib/sports/domain/models';
import type { TodayGroup } from '@/lib/services/sports/tips.service';

const GROUPS: { key: TodayGroup; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'analisando', label: 'Analisando' },
  { key: 'oportunidade', label: 'Com oportunidade' },
  { key: 'ignoradas', label: 'Ignoradas' },
];

/** Filtros da aba Hoje — vivem na URL e aplicam ao mudar. */
export function TodayFilters({
  leagues,
  counts,
}: {
  leagues: { key: string; name: string }[];
  counts: Record<TodayGroup, number>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === '') next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  };

  const group = (params.get('grupo') as TodayGroup | null) ?? 'todas';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {GROUPS.map((item) => {
          const active = group === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => set('grupo', item.key === 'todas' ? '' : item.key)}
              className={cn(
                'inline-flex min-h-[38px] items-center gap-2 rounded-full border px-3.5 text-xs font-bold transition-colors',
                active ? 'border-accent/40 bg-accent/12 text-accent' : 'border-line bg-elevated text-ink-muted hover:border-line-strong hover:text-ink',
              )}
            >
              {item.label}
              <span className={cn('tnum text-[10px]', active ? 'text-accent' : 'text-ink-faint')}>{counts[item.key]}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Campeonato" htmlFor="filtro-liga">
          <Select id="filtro-liga" value={params.get('liga') ?? ''} onChange={(e) => set('liga', e.target.value)}>
            <option value="">Todos</option>
            {leagues.map((league) => (
              <option key={league.key} value={league.key}>
                {league.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Horário" htmlFor="filtro-hora">
          <Select id="filtro-hora" value={params.get('hora') ?? ''} onChange={(e) => set('hora', e.target.value)}>
            <option value="">Qualquer</option>
            <option value="manha">Manhã (até 12h)</option>
            <option value="tarde">Tarde (12h–18h)</option>
            <option value="noite">Noite (após 18h)</option>
          </Select>
        </Field>
        <Field label="Mercado" htmlFor="filtro-mercado">
          <Select id="filtro-mercado" value={params.get('mercado') ?? ''} onChange={(e) => set('mercado', e.target.value)}>
            <option value="">Todos</option>
            {MARKET_KEYS.map((market) => (
              <option key={market} value={market}>
                {MARKET_LABEL[market]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Confiança" htmlFor="filtro-confianca">
          <Select id="filtro-confianca" value={params.get('confianca') ?? ''} onChange={(e) => set('confianca', e.target.value)}>
            <option value="">Qualquer</option>
            <option value="ALTA">Alta</option>
            <option value="MEDIA">Média</option>
            <option value="BAIXA">Baixa</option>
          </Select>
        </Field>
      </div>
    </div>
  );
}
