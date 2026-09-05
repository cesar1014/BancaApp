'use server';

import { redirect } from 'next/navigation';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import {
  endSession,
  getSessionUser,
  requireUserForAction,
  resolveDefaultBankrollId,
  startSession,
} from '@/lib/auth/session';
import {
  findUserById,
  findUserByLogin,
  touchLastLogin,
  updateUserPassword,
} from '@/lib/repos/users';
import { recordAudit } from '@/lib/audit';
import {
  changePasswordSchema,
  fieldErrors,
  formToObject,
  loginSchema,
  recoverPasswordSchema,
} from '@/lib/validation/schemas';
import { toActionError, type ActionResult, AppError } from '@/lib/errors';
import { defaultUserPassword } from '@/lib/auth/default-password';

export interface LoginResult {
  /** A conta ainda usa a senha padrão: o cliente leva para /trocar-senha. */
  mustChangePassword: boolean;
}

export async function loginAction(
  _prev: ActionResult<LoginResult> | null,
  formData: FormData,
): Promise<ActionResult<LoginResult>> {
  try {
    const parsed = loginSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Verifique os dados informados.',
        code: 'VALIDATION',
        details: fieldErrors(parsed.error),
      };
    }

    const user = await findUserByLogin(parsed.data.login);
    // Mensagem única para usuário inexistente e senha errada: não revela quem existe.
    const invalid: ActionResult<LoginResult> = {
      ok: false,
      error: 'Usuário ou senha inválidos.',
      code: 'UNAUTHENTICATED',
    };

    if (!user || !user.is_active) return invalid;

    const passwordOk = await verifyPassword(parsed.data.password, user.password_hash);
    if (!passwordOk) return invalid;

    const bankrollId = await resolveDefaultBankrollId();
    if (!bankrollId) {
      return {
        ok: false,
        error: 'Nenhuma banca configurada. Rode o seed inicial (npm run db:seed).',
        code: 'NOT_FOUND',
      };
    }

    // Se a senha digitada ainda é a padrão, a troca é obrigatória mesmo que a
    // flag tenha ficado para trás (ex.: conta criada antes desta regra).
    const usingDefault =
      user.must_change_password || (await verifyPassword(defaultUserPassword(), user.password_hash));

    await startSession({
      userId: user.id,
      bankrollId,
      role: user.role,
      tokenVersion: user.token_version,
    });
    await touchLastLogin(user.id);
    await recordAudit({
      user: { id: user.id, name: user.name },
      bankrollId,
      action: 'LOGIN',
      entity: 'session',
      entityId: null,
      description: `${user.name} entrou no sistema`,
    });

    return { ok: true, data: { mustChangePassword: usingDefault } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function logoutAction(): Promise<void> {
  const user = await getSessionUser();
  if (user) {
    await recordAudit({
      user,
      bankrollId: user.bankrollId,
      action: 'LOGOUT',
      entity: 'session',
      entityId: null,
      description: `${user.name} saiu do sistema`,
    });
  }
  await endSession();
  redirect('/login');
}

export async function changePasswordAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUserForAction();
    const parsed = changePasswordSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Verifique os dados informados.',
        code: 'VALIDATION',
        details: fieldErrors(parsed.error),
      };
    }

    const row = await findUserById(user.id);
    if (!row) throw new AppError('NOT_FOUND', 'Usuário não encontrado.');

    const currentOk = await verifyPassword(parsed.data.currentPassword, row.password_hash);
    if (!currentOk) {
      return {
        ok: false,
        error: 'A senha atual está incorreta.',
        code: 'VALIDATION',
        details: { currentPassword: ['Senha incorreta.'] },
      };
    }

    if (parsed.data.newPassword === defaultUserPassword()) {
      return {
        ok: false,
        error: 'A nova senha não pode ser a senha padrão.',
        code: 'VALIDATION',
        details: { newPassword: ['Escolha uma senha diferente da padrão.'] },
      };
    }

    await updateUserPassword(user.id, await hashPassword(parsed.data.newPassword));
    await recordAudit({
      user,
      bankrollId: user.bankrollId,
      action: 'USER_PASSWORD_RESET',
      entity: 'user',
      entityId: user.id,
      description: `${user.name} alterou a própria senha`,
    });

    // A troca de senha invalida o token atual — encerramos a sessão.
    await endSession();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Troca obrigatória no primeiro acesso: a pessoa já está autenticada com a
 * senha padrão. Depois de definir a nova senha, a sessão é reemitida — não
 * precisa entrar de novo.
 */
export async function completePasswordSetupAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUserForAction();
    const parsed = changePasswordSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Verifique os dados informados.',
        code: 'VALIDATION',
        details: fieldErrors(parsed.error),
      };
    }

    const row = await findUserById(user.id);
    if (!row) throw new AppError('NOT_FOUND', 'Usuário não encontrado.');

    const currentOk = await verifyPassword(parsed.data.currentPassword, row.password_hash);
    if (!currentOk) {
      return {
        ok: false,
        error: 'A senha padrão informada está incorreta.',
        code: 'VALIDATION',
        details: { currentPassword: ['Senha incorreta.'] },
      };
    }

    if (parsed.data.newPassword === defaultUserPassword()) {
      return {
        ok: false,
        error: 'A nova senha não pode ser a senha padrão.',
        code: 'VALIDATION',
        details: { newPassword: ['Escolha uma senha diferente da padrão.'] },
      };
    }

    const tokenVersion = await updateUserPassword(
      user.id,
      await hashPassword(parsed.data.newPassword),
      false,
    );

    await startSession({
      userId: user.id,
      bankrollId: user.bankrollId,
      role: user.role,
      tokenVersion,
    });

    await recordAudit({
      user,
      bankrollId: user.bankrollId,
      action: 'USER_PASSWORD_RESET',
      entity: 'user',
      entityId: user.id,
      description: `${user.name} definiu a própria senha no primeiro acesso`,
    });

    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * "Esqueci a senha": não há e-mail de recuperação. A pessoa informa o nick e
 * a senha padrão (que o administrador pode restaurar) e define a nova senha.
 */
export async function recoverPasswordAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const parsed = recoverPasswordSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Verifique os dados informados.',
        code: 'VALIDATION',
        details: fieldErrors(parsed.error),
      };
    }

    const invalid: ActionResult<null> = {
      ok: false,
      error:
        'Usuário ou senha padrão inválidos. Se você já trocou sua senha, peça ao administrador para restaurar a senha padrão.',
      code: 'UNAUTHENTICATED',
    };

    const user = await findUserByLogin(parsed.data.login);
    if (!user || !user.is_active) return invalid;

    // Só a senha padrão serve aqui: quem lembra a própria senha troca em Configurações.
    if (parsed.data.currentPassword !== defaultUserPassword()) return invalid;
    const currentOk = await verifyPassword(parsed.data.currentPassword, user.password_hash);
    if (!currentOk) return invalid;

    if (parsed.data.newPassword === defaultUserPassword()) {
      return {
        ok: false,
        error: 'A nova senha não pode ser a senha padrão.',
        code: 'VALIDATION',
        details: { newPassword: ['Escolha uma senha diferente da padrão.'] },
      };
    }

    await updateUserPassword(user.id, await hashPassword(parsed.data.newPassword), false);

    const bankrollId = await resolveDefaultBankrollId();
    await recordAudit({
      user: { id: user.id, name: user.name },
      bankrollId,
      action: 'USER_PASSWORD_RESET',
      entity: 'user',
      entityId: user.id,
      description: `${user.name} redefiniu a própria senha pela recuperação com a senha padrão`,
    });

    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
