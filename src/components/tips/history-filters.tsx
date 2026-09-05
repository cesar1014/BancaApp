'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Field, Input, Select } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { MARKET_KEYS, MARKET_LABEL } from '@/lib/sports/domain/models';
import type { FormEvent } from 'react';

export function TipHistoryFilters({ leagues }: { leagues: { key: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string' && value.trim() !== '') next.set(key, value.trim());
    }
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <Field label="Resultado" htmlFor="h-resultado">
        <Select id="h-resultado" name="resultado" defaultValue={params.get('resultado') ?? ''}>
          <option value="">Todos</option>
          <option value="GREEN">Green</option>
          <option value="RED">Red</option>
          <option value="PUSH">Push</option>
          <option value="ATIVAS">Em aberto</option>
        </Select>
      </Field>
      <Field label="Mercado" htmlFor="h-mercado">
        <Select id="h-mercado" name="mercado" defaultValue={params.get('mercado') ?? ''}>
          <option value="">Todos</option>
          {MARKET_KEYS.map((market) => (
            <option key={market} value={market}>
              {MARKET_LABEL[market]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Campeonato" htmlFor="h-liga">
        <Select id="h-liga" name="liga" defaultValue={params.get('liga') ?? ''}>
          <option value="">Todos</option>
          {leagues.map((league) => (
            <option key={league.key} value={league.key}>
              {league.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="De" htmlFor="h-de">
        <Input id="h-de" name="de" type="date" defaultValue={params.get('de') ?? ''} />
      </Field>
      <Field label="Até" htmlFor="h-ate">
        <Input id="h-ate" name="ate" type="date" defaultValue={params.get('ate') ?? ''} />
      </Field>
      <div className="flex items-end gap-2">
        <Button type="submit" variant="primary" size="sm" className="flex-1">
          Filtrar
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => router.push(pathname)}>
          Limpar
        </Button>
      </div>
    </form>
  );
}
