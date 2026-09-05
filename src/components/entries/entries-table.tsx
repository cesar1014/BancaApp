'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteEntryAction, settleEntryAction } from '@/actions/entries';
import { Button } from '@/components/ui/button';
import { Badge, EntryStatusBadge } from '@/components/ui/badge';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { Money, Result } from '@/components/ui/money';
import { IconAlert, IconEdit, IconEntries, IconTrash } from '@/components/icons';
import { formatDateBR, formatTime } from '@/lib/datetime';
import { formatOdd } from '@/lib/numbers';
import { formatMoney } from '@/lib/money';
import { ENTRY_STATUS_LABEL, type Entry, type EntryStatus } from '@/lib/domain/types';

const SETTLE_OPTIONS: EntryStatus[] = ['GREEN', 'RED', 'VOID', 'CASHOUT'];

/**
 * Quem pode editar. É um objeto de dados (e não uma função) porque este
 * componente também é usado a partir de Server Components, que só conseguem
 * enviar props serializáveis.
 */
export interface EntryPermissions {
  userId: string;
  memberId: string | null;
  isAdmin: boolean;
}

export function EntriesTable({
  entries,
  permissions,
  emptyAction,
  onEdit,
}: {
  entries: readonly Entry[];
  /** null = somente leitura. */
  permissions: EntryPermissions | null;
  emptyAction?: React.ReactNode;
  onEdit?: (entry: Entry) => void;
}) {
  const canEdit = (entry: Entry): boolean => {
    if (!permissions) return false;
    if (permissions.isAdmin) return true;
    if (entry.createdByUserId === permissions.userId) return true;
    return permissions.memberId !== null && entry.memberId === permissions.memberId;
  };

  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [toDelete, setToDelete] = useState<Entry | null>(null);
  const [toSettle, setToSettle] = useState<Entry | null>(null);
  const [settleStatus, setSettleStatus] = useState<EntryStatus>('GREEN');
  const [settlePayout, setSettlePayout] = useState('');

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<IconEntries />}
        title="Nenhuma entrada encontrada"
        description="Ajuste os filtros ou registre uma nova entrada."
        action={emptyAction}
      />
    );
  }

  const confirmDelete = () => {
    if (!toDelete) return;
    const target = toDelete;
    startTransition(async () => {
      const result = await deleteEntryAction(target.id);
      if (result.ok) {
        toast.success('Entrada excluída.');
        setToDelete(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const confirmSettle = () => {
    if (!toSettle) return;
    const target = toSettle;
    startTransition(async () => {
      const result = await settleEntryAction({
        entryId: target.id,
        status: settleStatus,
        ...(settleStatus === 'CASHOUT' ? { payout: settlePayout } : {}),
      });
      if (result.ok) {
        toast.success(`Entrada marcada como ${ENTRY_STATUS_LABEL[settleStatus]}.`);
        setToSettle(null);
        setSettlePayout('');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  /** Mesmas ações no cartão do celular e na linha da tabela. */
  const actions = (entry: Entry) => {
    if (!canEdit(entry)) return null;
    return (
      <div className="flex items-center justify-end gap-1">
        {entry.status === 'OPEN' ? (
          <Button
            size="sm"
            variant="subtle"
            onClick={() => {
              setToSettle(entry);
              setSettleStatus('GREEN');
            }}
          >
            Resolver
          </Button>
        ) : null}
        {onEdit ? (
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Editar entrada ${entry.event}`}
            onClick={() => onEdit(entry)}
          >
            <IconEdit />
          </Button>
        ) : null}
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Excluir entrada ${entry.event}`}
          onClick={() => setToDelete(entry)}
        >
          <IconTrash />
        </Button>
      </div>
    );
  };

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Celular: cada entrada é um cartão — tabela de 10 colunas não cabe */}
      {/* ---------------------------------------------------------------- */}
      <ul className="space-y-3 p-4 lg:hidden">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-lg border border-line bg-elevated/45 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold text-ink">{entry.event}</p>
                <p className="truncate text-xs text-ink-faint">{entry.market}</p>
              </div>
              <EntryStatusBadge status={entry.status} />
            </div>

            {entry.riskOverride ? (
              <Badge tone="warning" className="mt-2.5">
                <IconAlert /> Acima do limite
              </Badge>
            ) : null}

            <dl className="mt-3.5 grid grid-cols-3 gap-3 border-t border-line pt-3">
              <div>
                <dt className="lbl">Stake</dt>
                <dd className="mt-1 text-sm font-bold tnum text-ink">
                  {formatMoney(entry.stakeCents)}
                </dd>
              </div>
              <div>
                <dt className="lbl">Odd</dt>
                <dd className="mt-1 text-sm font-bold tnum text-ink-muted">
                  {formatOdd(entry.oddMilli)}
                </dd>
              </div>
              <div className="text-right">
                <dt className="lbl">Resultado</dt>
                <dd className="mt-1 text-sm">
                  {entry.status === 'OPEN' ? (
                    <span className="text-ink-faint">em aberto</span>
                  ) : (
                    <Result cents={entry.profitCents} />
                  )}
                </dd>
              </div>
            </dl>

            {entry.note ? (
              <p className="mt-3 line-clamp-2 text-xs italic leading-relaxed text-ink-faint">
                {entry.note}
              </p>
            ) : null}

            <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-2.5">
              <span className="min-w-0 truncate text-xs text-ink-faint">
                {formatDateBR(entry.occurredOn)} {formatTime(entry.occurredAtTime)} ·{' '}
                {entry.memberName} · {entry.sport}
              </span>
              {actions(entry)}
            </div>
          </li>
        ))}
      </ul>

      {/* ---------------------------------------------------------------- */}
      {/* Desktop: a mesma informação em tabela                             */}
      {/* ---------------------------------------------------------------- */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="table-head">
              <th className="px-5 py-3 font-extrabold">Data</th>
              <th className="px-3 py-3 font-extrabold">Evento / Mercado</th>
              <th className="px-3 py-3 font-extrabold">Responsável</th>
              <th className="px-3 py-3 font-extrabold">Esporte</th>
              <th className="px-3 py-3 text-right font-extrabold">Odd</th>
              <th className="px-3 py-3 text-right font-extrabold">Stake</th>
              <th className="px-3 py-3 text-center font-extrabold">Status</th>
              <th className="px-3 py-3 text-right font-extrabold">Retorno</th>
              <th className="px-3 py-3 text-right font-extrabold">Resultado</th>
              <th className="px-5 py-3 text-right font-extrabold">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entries.map((entry) => {
              return (
                <tr key={entry.id} className="row-hover align-top">
                  <td className="whitespace-nowrap px-5 py-3">
                    <p className="text-ink">{formatDateBR(entry.occurredOn)}</p>
                    <p className="text-xs text-ink-faint">{formatTime(entry.occurredAtTime)}</p>
                  </td>
                  <td className="max-w-[260px] px-3 py-3">
                    <p className="truncate text-ink">{entry.event}</p>
                    <p className="truncate text-xs text-ink-faint">{entry.market}</p>
                    {entry.riskOverride ? (
                      <Badge tone="warning" className="mt-1.5">
                        <IconAlert /> Acima do limite
                      </Badge>
                    ) : null}
                    {entry.note ? (
                      <p className="mt-1 line-clamp-2 text-xs italic text-ink-faint">{entry.note}</p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-ink-muted">{entry.memberName}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-ink-muted">{entry.sport}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tnum text-ink-muted">
                    {formatOdd(entry.oddMilli)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <Money cents={entry.stakeCents} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <EntryStatusBadge status={entry.status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tnum text-ink-muted">
                    {entry.status === 'OPEN' ? '—' : formatMoney(entry.payoutCents)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    {entry.status === 'OPEN' ? (
                      <span className="text-xs text-ink-faint">em aberto</span>
                    ) : (
                      <Result cents={entry.profitCents} />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right">{actions(entry)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        title="Excluir entrada"
        description={
          toDelete ? (
            <>
              A entrada <strong className="text-ink">{toDelete.event}</strong> de{' '}
              {formatDateBR(toDelete.occurredOn)} ({formatMoney(toDelete.stakeCents)}) será removida e
              a banca recalculada. Esta ação fica registrada na auditoria e não pode ser desfeita.
            </>
          ) : null
        }
        confirmLabel="Excluir"
        loading={pending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />

      <Modal
        open={toSettle !== null}
        onClose={() => setToSettle(null)}
        size="sm"
        title="Resolver entrada"
        description={toSettle ? `${toSettle.event} · ${formatMoney(toSettle.stakeCents)}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setToSettle(null)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={confirmSettle} loading={pending}>
              Confirmar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Resultado">
            <Select
              value={settleStatus}
              onChange={(event) => setSettleStatus(event.target.value as EntryStatus)}
            >
              {SETTLE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {ENTRY_STATUS_LABEL[option]}
                </option>
              ))}
            </Select>
          </Field>

          {settleStatus === 'CASHOUT' ? (
            <Field label="Retorno recebido (R$)" hint="Valor creditado ao encerrar a aposta.">
              <Input
                inputMode="decimal"
                value={settlePayout}
                onChange={(event) => setSettlePayout(event.target.value)}
                placeholder="72,00"
              />
            </Field>
          ) : null}

          <p className="text-xs leading-relaxed text-ink-muted">
            O lucro é recalculado no servidor a partir da stake e da odd já registradas.
          </p>
        </div>
      </Modal>
    </>
  );
}
