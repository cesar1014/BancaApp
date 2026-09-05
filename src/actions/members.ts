'use server';

import { revalidatePath } from 'next/cache';
import { requireUserForAction } from '@/lib/auth/session';
import { assertAdmin } from '@/lib/auth/permissions';
import {
  countMemberEntries,
  createMember,
  deleteMember,
  getMember,
  listMembers,
  updateMember,
  updateShares,
} from '@/lib/repos/members';
import {
  countAdmins,
  createUser,
  findUserByEmail,
  findUserByUsername,
  listUsers,
  updateUserProfile,
  updateUserPassword,
} from '@/lib/repos/users';
import { hashPassword } from '@/lib/auth/password';
import { defaultUserPassword } from '@/lib/auth/default-password';
import { isUniqueViolation } from '@/lib/db';
import {
  fieldErrors,
  formToObject,
  memberSchema,
  newUserSchema,
  resetPasswordSchema,
  userSchema,
} from '@/lib/validation/schemas';
import { conflict, forbidden, toActionError, validation, type ActionResult } from '@/lib/errors';
import { recordAudit, diffValues } from '@/lib/audit';
import { formatMoney } from '@/lib/money';
import { formatBps } from '@/lib/numbers';
import { suggestSharesFromCapital } from '@/lib/domain/partners';
import { listTransactions } from '@/lib/repos/transactions';
import type { Member } from '@/lib/domain/types';
import type { UserSummary } from '@/lib/repos/users';

const AFFECTED_PATHS = ['/dashboard', '/socios', '/estatisticas', '/entradas', '/configuracoes', '/auditoria'];

function revalidateAll(): void {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

export async function createMemberAction(
  _prev: ActionResult<Member> | null,
  formData: FormData,
): Promise<ActionResult<Member>> {
  try {
    const user = await requireUserForAction();
    assertAdmin(user, 'a inclusão de sócios');

    const parsed = memberSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Verifique os campos destacados.',
        code: 'VALIDATION',
        details: fieldErrors(parsed.error),
      };
    }

    const member = await createMember(user.bankrollId, {
      userId: parsed.data.userId,
      displayName: parsed.data.displayName,
      shareBps: parsed.data.share,
      initialContributionCents: parsed.data.initialContribution,
      canCreateEntries: parsed.data.canCreateEntries,
      isActive: parsed.data.isActive,
      joinedOn: parsed.data.joinedOn,
    });

    await recordAudit({
      user,
      bankrollId: user.bankrollId,
      action: 'MEMBER_CREATE',
      entity: 'member',
      entityId: member.id,
      description: `Adicionou o sócio ${member.displayName} com ${formatBps(member.shareBps)} de participação`,
      newValues: {
        nome: member.displayName,
        participacao: formatBps(member.shareBps),
        aporte_inicial: formatMoney(member.initialContributionCents),
      },
    });

    revalidateAll();
    return { ok: true, data: member };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: 'Este usuário já está vinculado a um sócio desta banca.', code: 'CONFLICT' };
    }
    return toActionError(error);
  }
}

export async function updateMemberAction(
  _prev: ActionResult<Member> | null,
  formData: FormData,
): Promise<ActionResult<Member>> {
  try {
    const user = await requireUserForAction();
    assertAdmin(user, 'a alteração de sócios');

    const memberId = String(formData.get('memberId') ?? '');
    const parsed = memberSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Verifique os campos destacados.',
        code: 'VALIDATION',
        details: fieldErrors(parsed.error),
      };
    }

    const existing = await getMember(user.bankrollId, memberId);
    const member = await updateMember(user.bankrollId, memberId, {
      userId: parsed.data.userId,
      displayName: parsed.data.displayName,
      shareBps: parsed.data.share,
      initialContributionCents: parsed.data.initialContribution,
      canCreateEntries: parsed.data.canCreateEntries,
      isActive: parsed.data.isActive,
      joinedOn: parsed.data.joinedOn,
    });

    const diff = diffValues(
      {
        nome: existing.displayName,
        participacao: formatBps(existing.shareBps),
        aporte_inicial: formatMoney(existing.initialContributionCents),
        ativo: existing.isActive,
        pode_registrar: existing.canCreateEntries,
      },
      {
        nome: member.displayName,
        participacao: formatBps(member.shareBps),
        aporte_inicial: formatMoney(member.initialContributionCents),
        ativo: member.isActive,
        pode_registrar: member.canCreateEntries,
      },
    );

    await recordAudit({
      user,
      bankrollId: user.bankrollId,
      action: 'MEMBER_UPDATE',
      entity: 'member',
      entityId: member.id,
      description: `Alterou o sócio ${member.displayName}`,
      oldValues: diff?.old ?? null,
      newValues: diff?.new ?? null,
    });

    revalidateAll();
    return { ok: true, data: member };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: 'Este usuário já está vinculado a um sócio desta banca.', code: 'CONFLICT' };
    }
    return toActionError(error);
  }
}

export async function deleteMemberAction(memberId: string): Promise<ActionResult<null>> {
  try {
    const user = await requireUserForAction();
    assertAdmin(user, 'a remoção de sócios');

    const existing = await getMember(user.bankrollId, memberId);
    const entries = await countMemberEntries(memberId);
    if (entries > 0) {
      throw conflict(
        `${existing.displayName} possui ${entries} entrada(s) registrada(s). Para preservar o histórico, desative o sócio em vez de removê-lo.`,
      );
    }

    await deleteMember(user.bankrollId, memberId);
    await recordAudit({
      user,
      bankrollId: user.bankrollId,
      action: 'MEMBER_DELETE',
      entity: 'member',
      entityId: memberId,
      description: `Removeu o sócio ${existing.displayName}`,
      oldValues: { nome: existing.displayName, participacao: formatBps(existing.shareBps) },
    });

    revalidateAll();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/** Redistribui as participações proporcionalmente ao capital investido. */
export async function redistributeSharesAction(): Promise<ActionResult<null>> {
  try {
    const user = await requireUserForAction();
    assertAdmin(user, 'a redistribuição de participações');

    const [members, transactions] = await Promise.all([
      listMembers(user.bankrollId),
      listTransactions(user.bankrollId),
    ]);
    const active = members.filter((m) => m.isActive);
    if (active.length === 0) throw validation('Não há sócios ativos para redistribuir.');

    const invested = active.map((member) => {
      const contributions = transactions
        .filter((t) => t.memberId === member.id && t.kind === 'CONTRIBUTION')
        .reduce((acc, t) => acc + t.amountCents, 0);
      const withdrawals = transactions
        .filter((t) => t.memberId === member.id && t.kind === 'WITHDRAWAL')
        .reduce((acc, t) => acc + t.amountCents, 0);
      return {
        id: member.id,
        investedCents: member.initialContributionCents + contributions - withdrawals,
      };
    });

    const totalInvested = invested.reduce((acc, m) => acc + Math.max(m.investedCents, 0), 0);
    if (totalInvested <= 0) {
      throw validation('Nenhum capital registrado nos sócios ativos — informe os aportes primeiro.');
    }

    const suggestion = suggestSharesFromCapital(invested);
    const updates = active.map((member) => ({
      memberId: member.id,
      shareBps: suggestion.get(member.id) ?? 0,
    }));

    // Sócios inativos ficam com 0% para que a soma dos ativos feche em 100%.
    const inactive = members.filter((m) => !m.isActive).map((m) => ({ memberId: m.id, shareBps: 0 }));

    await updateShares(user.bankrollId, [...updates, ...inactive]);

    await recordAudit({
      user,
      bankrollId: user.bankrollId,
      action: 'MEMBER_SHARES_UPDATE',
      entity: 'member',
      entityId: null,
      description: 'Redistribuiu as participações proporcionalmente ao capital investido',
      oldValues: Object.fromEntries(members.map((m) => [m.displayName, formatBps(m.shareBps)])),
      newValues: Object.fromEntries(
        active.map((m) => [m.displayName, formatBps(suggestion.get(m.id) ?? 0)]),
      ),
    });

    revalidateAll();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Usuários de acesso
// ---------------------------------------------------------------------------

export async function createUserAction(
  _prev: ActionResult<UserSummary> | null,
  formData: FormData,
): Promise<ActionResult<UserSummary>> {
  try {
    const user = await requireUserForAction();
    assertAdmin(user, 'a criação de usuários');

    const parsed = newUserSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Verifique os campos destacados.',
        code: 'VALIDATION',
        details: fieldErrors(parsed.error),
      };
    }

    const existing = await findUserByEmail(parsed.data.email);
    if (existing) return { ok: false, error: 'Já existe um usuário com este e-mail.', code: 'CONFLICT' };
    if (parsed.data.username && (await findUserByUsername(parsed.data.username))) {
      return { ok: false, error: 'Já existe um usuário com este nick.', code: 'CONFLICT' };
    }

    // Toda conta nova nasce com a senha padrão e troca obrigatória no primeiro acesso.
    const created = await createUser({
      name: parsed.data.name,
      email: parsed.data.email,
      username: parsed.data.username,
      passwordHash: await hashPassword(defaultUserPassword()),
      role: parsed.data.role,
      mustChangePassword: true,
    });

    await recordAudit({
      user,
      bankrollId: user.bankrollId,
      action: 'USER_CREATE',
      entity: 'user',
      entityId: created.id,
      description: `Criou o usuário ${created.name} (${created.username ? `@${created.username}` : created.email}) com a senha padrão`,
      newValues: { nome: created.name, usuario: created.username, email: created.email, perfil: created.role },
    });

    revalidateAll();
    return { ok: true, data: created };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: 'Já existe um usuário com este e-mail ou nick.', code: 'CONFLICT' };
    }
    return toActionError(error);
  }
}

export async function updateUserAction(
  _prev: ActionResult<UserSummary> | null,
  formData: FormData,
): Promise<ActionResult<UserSummary>> {
  try {
    const user = await requireUserForAction();
    assertAdmin(user, 'a alteração de usuários');

    const userId = String(formData.get('userId') ?? '');
    const parsed = userSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Verifique os campos destacados.',
        code: 'VALIDATION',
        details: fieldErrors(parsed.error),
      };
    }

    const all = await listUsers();
    const before = all.find((u) => u.id === userId);
    if (!before) return { ok: false, error: 'Usuário não encontrado.', code: 'NOT_FOUND' };

    // O dono é sempre administrador ativo — ninguém rebaixa nem desativa o dono.
    const role = before.isOwner ? 'ADMIN' : parsed.data.role;
    const isActive = before.isOwner ? true : parsed.data.isActive;

    // Nunca deixar a banca sem administrador ativo.
    const losingAdmin = before.role === 'ADMIN' && (role !== 'ADMIN' || !isActive);
    if (losingAdmin && (await countAdmins()) <= 1) {
      throw forbidden('É necessário manter pelo menos um administrador ativo.');
    }
    if (userId === user.id && !isActive) {
      throw forbidden('Você não pode desativar a própria conta.');
    }

    if (parsed.data.username) {
      const sameNick = await findUserByUsername(parsed.data.username);
      if (sameNick && sameNick.id !== userId) {
        return { ok: false, error: 'Já existe um usuário com este nick.', code: 'CONFLICT' };
      }
    }

    const updated = await updateUserProfile(userId, {
      name: parsed.data.name,
      email: parsed.data.email,
      username: parsed.data.username,
      role,
      isActive,
    });

    const diff = diffValues(
      { nome: before.name, usuario: before.username, email: before.email, perfil: before.role, ativo: before.isActive },
      { nome: updated.name, usuario: updated.username, email: updated.email, perfil: updated.role, ativo: updated.isActive },
    );

    await recordAudit({
      user,
      bankrollId: user.bankrollId,
      action: 'USER_UPDATE',
      entity: 'user',
      entityId: updated.id,
      description: `Alterou o usuário ${updated.name}`,
      oldValues: diff?.old ?? null,
      newValues: diff?.new ?? null,
    });

    revalidateAll();
    return { ok: true, data: updated };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: 'Já existe um usuário com este e-mail ou nick.', code: 'CONFLICT' };
    }
    return toActionError(error);
  }
}

/**
 * "Esqueci a senha", lado do administrador: a conta volta para a senha
 * padrão e o usuário define a nova pelo fluxo de recuperação ou no login.
 */
export async function restoreDefaultPasswordAction(userId: string): Promise<ActionResult<null>> {
  try {
    const user = await requireUserForAction();
    assertAdmin(user, 'a restauração de senhas');

    const all = await listUsers();
    const target = all.find((u) => u.id === userId);
    if (!target) return { ok: false, error: 'Usuário não encontrado.', code: 'NOT_FOUND' };

    await updateUserPassword(userId, await hashPassword(defaultUserPassword()), true);

    await recordAudit({
      user,
      bankrollId: user.bankrollId,
      action: 'USER_PASSWORD_RESET',
      entity: 'user',
      entityId: target.id,
      description: `Restaurou a senha padrão de ${target.name}. O usuário deverá definir uma nova senha no próximo acesso.`,
    });

    revalidateAll();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function resetUserPasswordAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUserForAction();
    assertAdmin(user, 'a redefinição de senhas');

    const parsed = resetPasswordSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Verifique os campos destacados.',
        code: 'VALIDATION',
        details: fieldErrors(parsed.error),
      };
    }

    const all = await listUsers();
    const target = all.find((u) => u.id === parsed.data.userId);
    if (!target) return { ok: false, error: 'Usuário não encontrado.', code: 'NOT_FOUND' };

    await updateUserPassword(parsed.data.userId, await hashPassword(parsed.data.newPassword));

    await recordAudit({
      user,
      bankrollId: user.bankrollId,
      action: 'USER_PASSWORD_RESET',
      entity: 'user',
      entityId: target.id,
      description: `Redefiniu a senha de ${target.name}. Todas as sessões desse usuário foram encerradas.`,
    });

    revalidateAll();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
