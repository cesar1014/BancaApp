'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { IconFilter, IconSearch } from '@/components/icons';
import { ENTRY_STATUS_LABEL, ENTRY_STATUSES, type EntryStatus, type Member } from '@/lib/domain/types';
import { cn } from '@/lib/cn';

export interface HistoryFilterValues {
  de: string;
  ate: string;
  socio: string;
  esporte: string;
  mercado: string;
  status: EntryStatus[];
  oddMin: string;
  oddMax: string;
  stakeMin: string;
  stakeMax: string;
  busca: string;
}

/**
 * Filtros do histórico. Tudo vive na URL: o resultado é compartilhável,
 * volta no botão "voltar" do navegador e é recalculado no servidor.
 */
export function HistoryFilters({
  values,
  members,
  sports,
  markets,
}: {
  values: HistoryFilterValues;
  members: readonly Member[];
  sports: readonly string[];
  markets: readonly string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState(
    Boolean(values.oddMin || values.oddMax || values.stakeMin || values.stakeMax || values.esporte || values.mercado),
  );
  const [statuses, setStatuses] = useState<EntryStatus[]>(values.status);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();

    for (const [key, value] of formData.entries()) {
      if (typeof value === 'string' && value.trim() !== '') params.append(key, value.trim());
    }
    for (const status of statuses) params.append('status', status);

    router.push(`/historico?${params.toString()}`);
  };

  const clear = () => {
    setStatuses([]);
    router.push('/historico');
  };

  const toggleStatus = (status: EntryStatus) => {
    setStatuses((current) =>
      current.includes(status) ? current.filter((s) => s !== status) : [...current, status],
    );
  };

  const activeCount = Array.from(searchParams.keys()).filter((key) => key !== 'pagina').length;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="De" htmlFor="de">
          <Input id="de" name="de" type="date" defaultValue={values.de} />
        </Field>
        <Field label="Até" htmlFor="ate">
          <Input id="ate" name="ate" type="date" defaultValue={values.ate} />
        </Field>
        <Field label="Responsável" htmlFor="socio">
          <Select id="socio" name="socio" defaultValue={values.socio}>
            <option value="">Todos</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Buscar" htmlFor="busca" hint="Evento, mercado, esporte ou observação">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint" />
            <Input
              id="busca"
              name="busca"
              defaultValue={values.busca}
              placeholder="Palmeiras, escanteios..."
              className="pl-9"
            />
          </div>
        </Field>
      </div>

      <div>
        <p className="field-label">Status</p>
        <div className="flex flex-wrap gap-2">
          {ENTRY_STATUSES.map((status) => {
            const active = statuses.includes(status);
            return (
              <button
                key={status}
                type="button"
                onClick={() => toggleStatus(status)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  active
                    ? 'border-accent/40 bg-accent/12 text-accent'
                    : 'border-line bg-elevated text-ink-muted hover:border-line-strong hover:text-ink',
                )}
              >
                {ENTRY_STATUS_LABEL[status]}
              </button>
            );
          })}
        </div>
      </div>

      {expanded ? (
        <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Esporte" htmlFor="esporte">
            <Select id="esporte" name="esporte" defaultValue={values.esporte}>
              <option value="">Todos</option>
              {sports.map((sport) => (
                <option key={sport} value={sport}>
                  {sport}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Mercado" htmlFor="mercado">
            <Select id="mercado" name="mercado" defaultValue={values.mercado}>
              <option value="">Todos</option>
              {markets.map((market) => (
                <option key={market} value={market}>
                  {market}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Odd mínima" htmlFor="oddMin">
              <Input id="oddMin" name="oddMin" inputMode="decimal" defaultValue={values.oddMin} placeholder="1,50" />
            </Field>
            <Field label="Odd máxima" htmlFor="oddMax">
              <Input id="oddMax" name="oddMax" inputMode="decimal" defaultValue={values.oddMax} placeholder="3,00" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stake mínima (R$)" htmlFor="stakeMin">
              <Input id="stakeMin" name="stakeMin" inputMode="decimal" defaultValue={values.stakeMin} placeholder="10" />
            </Field>
            <Field label="Stake máxima (R$)" htmlFor="stakeMax">
              <Input id="stakeMax" name="stakeMax" inputMode="decimal" defaultValue={values.stakeMax} placeholder="100" />
            </Field>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
          <IconFilter />
          {expanded ? 'Menos filtros' : 'Mais filtros'}
        </Button>
        <div className="flex items-center gap-2">
          {activeCount > 0 ? (
            <Button type="button" variant="secondary" size="sm" onClick={clear}>
              Limpar
            </Button>
          ) : null}
          <Button type="submit" variant="primary" size="sm">
            Aplicar filtros
          </Button>
        </div>
      </div>
    </form>
  );
}
