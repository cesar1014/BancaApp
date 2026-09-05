'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createUserAction,
  restoreDefaultPasswordAction,
  resetUserPasswordAction,
  updateUserAction,
} from '@/actions/members';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Notice } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { IconEdit, IconLock, IconPlus, IconUnlock } from '@/components/icons';
import { formatDateTimeBR } from '@/lib/datetime';
import type { ActionResult } from '@/lib/errors';
import type { UserSummary } from '@/lib/repos/users';

export function UsersPanel({
  users,
  defaultPassword,
}: {
  users: UserSummary[];
  /** Senha padrão do sistema, exibida para o administrador repassar. */
  defaultPassword: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserSummary | null>(null);
  const [resetting, setResetting] = useState<UserSummary | null>(null);
  const [restoring, setRestoring] = useState<UserSummary | null>(null);
  const [pending, startTransition] = useTransition();

  const confirmRestore = () => {
    if (!restoring) return;
    const target = restoring;
    startTransition(async () => {
      const result = await restoreDefaultPasswordAction(target.id);
      if (result.ok) {
        toast.success(`Senha de ${target.name} restaurada para a padrão.`);
        setRestoring(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-ink-muted">
          Contas novas e senhas restauradas usam a senha padrão{' '}
          <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[12px] text-ink">
            {defaultPassword}
          </code>
          . No primeiro acesso o sistema exige a troca.
        </p>
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
          <IconPlus /> Novo usuário
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="table-head">
              <th className="px-5 py-2.5 font-semibold">Nome</th>
              <th className="px-3 py-2.5 font-semibold">Usuário</th>
              <th className="px-3 py-2.5 font-semibold">E-mail</th>
              <th className="px-3 py-2.5 font-semibold">Último acesso</th>
              <th className="px-5 py-2.5 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((user) => (
              <tr key={user.id} className="row-hover">
                <td className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-ink">{user.name}</span>
                    {!user.isActive ? <Badge tone="muted">Inativo</Badge> : null}
                    {user.mustChangePassword ? <Badge tone="warning">Senha padrão</Badge> : null}
                  </div>
                </td>
                <td className="px-3 py-3 font-mono text-[13px] text-ink-muted">
                  {user.username ? `@${user.username}` : '—'}
                </td>
                <td className="px-3 py-3 text-ink-muted">{user.email}</td>
                <td className="px-3 py-3 text-xs text-ink-muted">
                  {user.lastLoginAt ? formatDateTimeBR(user.lastLoginAt) : 'nunca acessou'}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Editar usuário"
                      title="Editar"
                      onClick={() => setEditing(user)}
                    >
                      <IconEdit />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Restaurar senha padrão"
                      title="Restaurar senha padrão"
                      onClick={() => setRestoring(user)}
                    >
                      <IconUnlock />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Definir senha"
                      title="Definir senha"
                      onClick={() => setResetting(user)}
                    >
                      <IconLock />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <UserFormModal open={creating} onClose={() => setCreating(false)} defaultPassword={defaultPassword} />
      <UserFormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        user={editing}
        defaultPassword={defaultPassword}
      />
      <ResetPasswordModal
        open={resetting !== null}
        onClose={() => setResetting(null)}
        user={resetting}
      />
      <ConfirmDialog
        open={restoring !== null}
        tone="primary"
        title="Restaurar senha padrão"
        description={
          restoring ? (
            <>
              A senha de <strong className="text-ink">{restoring.name}</strong> voltará a ser{' '}
              <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[12px] text-ink">
                {defaultPassword}
              </code>
              . Todas as sessões abertas serão encerradas e, no próximo acesso, será exigida uma
              senha nova. Use isto quando alguém esquecer a senha.
            </>
          ) : null
        }
        confirmLabel="Restaurar"
        loading={pending}
        onConfirm={confirmRestore}
        onCancel={() => setRestoring(null)}
      />
    </>
  );
}

function UserFormModal({
  open,
  onClose,
  user,
  defaultPassword,
}: {
  open: boolean;
  onClose: () => void;
  user?: UserSummary | null;
  defaultPassword: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const isEdit = Boolean(user);
  const [state, formAction, pending] = useActionState<ActionResult<UserSummary> | null, FormData>(
    isEdit ? updateUserAction : createUserAction,
    null,
  );

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(isEdit ? 'Usuário atualizado.' : `Usuário criado com a senha padrão ${defaultPassword}.`);
      onClose();
      router.refresh();
    } else if (state.code !== 'VALIDATION') {
      toast.error(state.error);
    }
  }, [state, isEdit, onClose, router, toast, defaultPassword]);

  const details = state && !state.ok ? state.details : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={isEdit ? 'Editar usuário' : 'Novo usuário'}
      description="Cada integrante deve ter a própria conta — nunca compartilhe credenciais."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="user-form" variant="primary" loading={pending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="user-form" action={formAction} className="space-y-4" noValidate>
        {user ? <input type="hidden" name="userId" value={user.id} /> : null}
        {state && !state.ok ? <Notice tone="danger" title={state.error} /> : null}

        <Field label="Nome" htmlFor="user-name" error={details?.name} required>
          <Input id="user-name" name="name" defaultValue={user?.name ?? ''} required />
        </Field>

        <Field
          label="Usuário (nick)"
          htmlFor="user-username"
          error={details?.username}
          hint="Usado para entrar no sistema. Letras, números, ponto, hífen e sublinhado."
          required
        >
          <Input
            id="user-username"
            name="username"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={user?.username ?? ''}
            required
          />
        </Field>

        <Field label="E-mail" htmlFor="user-email" error={details?.email} required>
          <Input
            id="user-email"
            name="email"
            type="email"
            defaultValue={user?.email ?? ''}
            required
          />
        </Field>

        {!isEdit ? (
          <Notice tone="info" title={`Senha inicial: ${defaultPassword}`}>
            O usuário entra com essa senha e é obrigado a definir a própria no primeiro acesso.
          </Notice>
        ) : null}

        <Field label="Perfil" htmlFor="user-role" error={details?.role} required>
          {/* O dono é sempre administrador: o campo fica travado e o servidor força ADMIN. */}
          <Select
            id="user-role"
            name="role"
            defaultValue={user?.role ?? 'ADMIN'}
            disabled={user?.isOwner ?? false}
            required
          >
            <option value="ADMIN">Administrador</option>
            <option value="PARTNER">Sócio</option>
          </Select>
          {user?.isOwner ? <input type="hidden" name="role" value="ADMIN" /> : null}
        </Field>

        <Checkbox
          name="isActive"
          label="Conta ativa"
          description="Desativar encerra imediatamente todas as sessões deste usuário."
          defaultChecked={user?.isActive ?? true}
          disabled={user?.isOwner ?? false}
        />
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: UserSummary | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    resetUserPasswordAction,
    null,
  );

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success('Senha definida. As sessões desse usuário foram encerradas.');
      onClose();
      router.refresh();
    } else if (state.code !== 'VALIDATION') {
      toast.error(state.error);
    }
  }, [state, onClose, router, toast]);

  const details = state && !state.ok ? state.details : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Definir senha"
      description={user ? `Nova senha para ${user.name}.` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="reset-password-form" variant="primary" loading={pending}>
            Definir
          </Button>
        </>
      }
    >
      <form id="reset-password-form" action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="userId" value={user?.id ?? ''} />
        {state && !state.ok ? <Notice tone="danger" title={state.error} /> : null}

        <Field label="Nova senha" htmlFor="newPassword" error={details?.newPassword} required>
          <Input id="newPassword" name="newPassword" type="password" minLength={8} required />
        </Field>

        <p className="text-xs leading-relaxed text-ink-muted">
          Informe a nova senha ao usuário por um canal seguro. Todas as sessões abertas dele serão
          encerradas imediatamente. Para o fluxo normal de &quot;esqueci a senha&quot;, prefira{' '}
          <strong className="text-ink">Restaurar senha padrão</strong>.
        </p>
      </form>
    </Modal>
  );
}
