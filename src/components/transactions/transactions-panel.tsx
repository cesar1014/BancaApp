'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createTransactionAction,
  deleteTransactionAction,
  updateTransactionAction,
} from '@/actions/transactions';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { EmptyState, Notice } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { IconEdit, IconPlus, IconTransfer, IconTrash } from '@/components/icons';
import { centsToReals, formatMoney } from '@/lib/money';
import { formatDateBR } from '@/lib/datetime';
import { TRANSACTION_KIND_LABEL, type Member, type Transaction } from '@/lib/domain/types';
import type { ActionResult } from '@/lib/errors';

export function TransactionsPanel({
  transactions,
  members,
  canManage,
  today,
}: {
  transactions: Transaction[];
  members: Member[];
  canManage: boolean;
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [toDelete, setToDelete] = useState<Transaction | null>(null);

  const confirmDelete = () => {
    if (!toDelete) return;
    const target = toDelete;
    startTransition(async () => {
      const result = await deleteTransactionAction(target.id);
      if (result.ok) {
        toast.success('Movimentação excluída.');
        setToDelete(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      {canManage ? (
        <div className="mb-4 flex justify-end">
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <IconPlus /> Nova movimentação
          </Button>
        </div>
      ) : null}

      {transactions.length === 0 ? (
        <EmptyState
          icon={<IconTransfer />}
          title="Nenhuma movimentação registrada"
          description="Aportes aumentam a banca e retiradas reduzem — mas nenhum dos dois entra no lucro das entradas."
          action={
            canManage ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setModalOpen(true);
                }}
              >
                <IconPlus /> Registrar movimentação
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="table-head">
                <th className="px-5 py-2.5 font-semibold">Data</th>
                <th className="px-3 py-2.5 font-semibold">Tipo</th>
                <th className="px-3 py-2.5 font-semibold">Sócio</th>
                <th className="px-3 py-2.5 font-semibold">Observação</th>
                <th className="px-3 py-2.5 font-semibold">Registrado por</th>
                <th className="px-3 py-2.5 text-right font-semibold">Valor</th>
                {canManage ? <th className="px-5 py-2.5 text-right font-semibold">Ações</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="row-hover">
                  <td className="whitespace-nowrap px-5 py-3 text-ink">
                    {formatDateBR(transaction.occurredOn)}
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={transaction.kind === 'CONTRIBUTION' ? 'positive' : 'warning'}>
                      {TRANSACTION_KIND_LABEL[transaction.kind]}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-ink-muted">
                    {transaction.memberName ?? <span className="text-ink-faint">— banca</span>}
                  </td>
                  <td className="max-w-[240px] px-3 py-3">
                    <p className="truncate text-xs text-ink-muted">{transaction.note ?? '—'}</p>
                  </td>
                  <td className="px-3 py-3 text-xs text-ink-faint">
                    {transaction.createdByName ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <span
                      className={
                        transaction.kind === 'CONTRIBUTION'
                          ? 'tnum font-medium text-positive'
                          : 'tnum font-medium text-warning'
                      }
                    >
                      {transaction.kind === 'CONTRIBUTION' ? '+' : '−'}
                      {formatMoney(transaction.amountCents)}
                    </span>
                  </td>
                  {canManage ? (
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Editar movimentação"
                          onClick={() => {
                            setEditing(transaction);
                            setModalOpen(true);
                          }}
                        >
                          <IconEdit />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Excluir movimentação"
                          onClick={() => setToDelete(transaction)}
                        >
                          <IconTrash />
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage ? (
        <TransactionFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          transaction={editing}
          members={members}
          today={today}
        />
      ) : null}

      <ConfirmDialog
        open={toDelete !== null}
        title="Excluir movimentação"
        description={
          toDelete ? (
            <>
              {TRANSACTION_KIND_LABEL[toDelete.kind]} de{' '}
              <strong className="text-ink">{formatMoney(toDelete.amountCents)}</strong> em{' '}
              {formatDateBR(toDelete.occurredOn)}. A banca será recalculada.
            </>
          ) : null
        }
        confirmLabel="Excluir"
        loading={pending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}

function TransactionFormModal({
  open,
  onClose,
  transaction,
  members,
  today,
}: {
  open: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  members: readonly Member[];
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const isEdit = Boolean(transaction);
  const [state, formAction, pending] = useActionState<ActionResult<Transaction> | null, FormData>(
    isEdit ? updateTransactionAction : createTransactionAction,
    null,
  );

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(isEdit ? 'Movimentação atualizada.' : 'Movimentação registrada.');
      onClose();
      router.refresh();
    } else if (state.code !== 'VALIDATION') {
      toast.error(state.error);
    }
  }, [state, isEdit, onClose, router, toast]);

  const details = state && !state.ok ? state.details : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={isEdit ? 'Editar movimentação' : 'Nova movimentação'}
      description="Aportes e retiradas movimentam a banca, mas nunca entram no lucro nem no ROI."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="transaction-form" variant="primary" loading={pending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="transaction-form" action={formAction} className="space-y-4" noValidate>
        {transaction ? <input type="hidden" name="transactionId" value={transaction.id} /> : null}
        {state && !state.ok ? <Notice tone="danger" title={state.error} /> : null}

        <Field label="Tipo" htmlFor="kind" error={details?.kind} required>
          <Select id="kind" name="kind" defaultValue={transaction?.kind ?? 'CONTRIBUTION'} required>
            <option value="CONTRIBUTION">Aporte (entra dinheiro na banca)</option>
            <option value="WITHDRAWAL">Retirada (sai dinheiro da banca)</option>
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor (R$)" htmlFor="amount" error={details?.amount} required>
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              defaultValue={
                transaction ? centsToReals(transaction.amountCents).toFixed(2).replace('.', ',') : ''
              }
              placeholder="500,00"
              required
            />
          </Field>
          <Field label="Data" htmlFor="tx-date" error={details?.occurredOn} required>
            <Input
              id="tx-date"
              name="occurredOn"
              type="date"
              defaultValue={transaction?.occurredOn ?? today}
              required
            />
          </Field>
        </div>

        <Field
          label="Sócio"
          htmlFor="tx-member"
          error={details?.memberId}
          hint="Deixe em branco se o valor não pertence a um sócio específico."
        >
          <Select id="tx-member" name="memberId" defaultValue={transaction?.memberId ?? ''}>
            <option value="">Sem sócio vinculado</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Observação" htmlFor="tx-note" error={details?.note}>
          <Textarea
            id="tx-note"
            name="note"
            defaultValue={transaction?.note ?? ''}
            placeholder="Motivo do aporte ou da retirada"
          />
        </Field>
      </form>
    </Modal>
  );
}
