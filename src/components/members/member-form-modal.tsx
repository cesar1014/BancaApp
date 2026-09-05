'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createMemberAction, updateMemberAction } from '@/actions/members';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { Notice } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { centsToReals } from '@/lib/money';
import type { ActionResult } from '@/lib/errors';
import type { Member } from '@/lib/domain/types';
import type { UserSummary } from '@/lib/repos/users';

export function MemberFormModal({
  open,
  onClose,
  member,
  users,
  today,
}: {
  open: boolean;
  onClose: () => void;
  member?: Member | null;
  users: readonly UserSummary[];
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const isEdit = Boolean(member);

  const [state, formAction, pending] = useActionState<ActionResult<Member> | null, FormData>(
    isEdit ? updateMemberAction : createMemberAction,
    null,
  );

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(isEdit ? 'Sócio atualizado.' : 'Sócio adicionado.');
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
      title={isEdit ? 'Editar sócio' : 'Novo sócio'}
      description="A soma das participações de todos os sócios ativos precisa fechar em 100%."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="member-form" variant="primary" loading={pending}>
            {isEdit ? 'Salvar' : 'Adicionar'}
          </Button>
        </>
      }
    >
      <form id="member-form" action={formAction} className="space-y-4" noValidate>
        {member ? <input type="hidden" name="memberId" value={member.id} /> : null}
        {state && !state.ok ? <Notice tone="danger" title={state.error} /> : null}

        <Field label="Nome do sócio" htmlFor="displayName" error={details?.displayName} required>
          <Input
            id="displayName"
            name="displayName"
            defaultValue={member?.displayName ?? ''}
            placeholder="César"
            required
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Participação (%)"
            htmlFor="share"
            error={details?.share}
            hint="Percentual sobre o lucro das entradas."
            required
          >
            <Input
              id="share"
              name="share"
              inputMode="decimal"
              defaultValue={member ? String(member.shareBps / 100).replace('.', ',') : '25'}
              required
            />
          </Field>
          <Field
            label="Aporte inicial (R$)"
            htmlFor="initialContribution"
            error={details?.initialContribution}
            hint="Capital que este sócio colocou na abertura da banca."
            required
          >
            <Input
              id="initialContribution"
              name="initialContribution"
              inputMode="decimal"
              defaultValue={
                member ? centsToReals(member.initialContributionCents).toFixed(2).replace('.', ',') : '0,00'
              }
              required
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Entrou em" htmlFor="joinedOn" error={details?.joinedOn} required>
            <Input
              id="joinedOn"
              name="joinedOn"
              type="date"
              defaultValue={member?.joinedOn ?? today}
              required
            />
          </Field>
          <Field
            label="Usuário de acesso"
            htmlFor="userId"
            error={details?.userId}
            hint="Opcional: vincula o sócio a uma conta de login."
          >
            <Select id="userId" name="userId" defaultValue={member?.userId ?? ''}>
              <option value="">Sem conta vinculada</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} — {user.email}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Checkbox
          name="canCreateEntries"
          label="Pode registrar entradas"
          description="Válido quando as configurações permitem que sócios registrem entradas."
          defaultChecked={member?.canCreateEntries ?? true}
        />

        <Checkbox
          name="isActive"
          label="Sócio ativo"
          description="Sócios inativos deixam de aparecer nas seleções, mas o histórico é preservado."
          defaultChecked={member?.isActive ?? true}
        />
      </form>
    </Modal>
  );
}
