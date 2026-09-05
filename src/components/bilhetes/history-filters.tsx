'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';

export function SlipHistoryFilters({ sources }: { sources: { slug: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const [key, value] of form.entries()) if (typeof value === 'string' && value.trim() !== '') next.set(key, value.trim());
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="Fonte" htmlFor="f-fonte">
        <Select id="f-fonte" name="fonte" defaultValue={params.get('fonte') ?? ''}>
          <option value="">Todas</option>
          {sources.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Resultado" htmlFor="f-resultado">
        <Select id="f-resultado" name="resultado" defaultValue={params.get('resultado') ?? ''}>
          <option value="">Todos</option>
          <option value="GREEN">Green</option>
          <option value="RED">Red</option>
          <option value="PUSH">Push</option>
          <option value="OPEN">Em aberto</option>
          <option value="PENDING">Conferência manual</option>
        </Select>
      </Field>
      <Field label="De" htmlFor="f-de">
        <Input id="f-de" name="de" type="date" defaultValue={params.get('de') ?? ''} />
      </Field>
      <Field label="Até" htmlFor="f-ate">
        <Input id="f-ate" name="ate" type="date" defaultValue={params.get('ate') ?? ''} />
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
