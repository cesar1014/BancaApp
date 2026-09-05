import { forbidden } from '@/lib/errors';
import type { BankrollSettings, SessionUser } from '@/lib/domain/types';

/**
 * Matriz de permissões.
 *
 * Estas funções são puras e usadas SEMPRE no servidor, antes de qualquer
 * escrita. A interface esconde botões por conveniência, mas quem decide é
 * aqui — esconder no cliente nunca é controle de acesso.
 *
 * Há três níveis: dono (único, altera banca inicial e metas), administrador
 * e sócio.
 */

export function isAdmin(user: SessionUser): boolean {
  return user.role === 'ADMIN';
}

export function isOwner(user: SessionUser): boolean {
  return user.isOwner;
}

export function canManageSettings(user: SessionUser): boolean {
  return isAdmin(user);
}

/** Banca inicial, meta mensal, banca-alvo e metas do mês: só o dono. */
export function canManageGoals(user: SessionUser): boolean {
  return isOwner(user);
}

export function canManageMembers(user: SessionUser): boolean {
  return isAdmin(user);
}

export function canManageTransactions(user: SessionUser): boolean {
  return isAdmin(user);
}

export function canCloseMonth(user: SessionUser): boolean {
  return isAdmin(user);
}

export function canOverrideRisk(user: SessionUser): boolean {
  return isAdmin(user);
}

/** Painel de provedores e ações de atualização da Central de Dicas. */
export function canManageTips(user: SessionUser): boolean {
  return isAdmin(user);
}

export function canCreateEntry(user: SessionUser, settings: BankrollSettings): boolean {
  if (isAdmin(user)) return true;
  if (!settings.partnersCanCreateEntries) return false;
  return user.canCreateEntries && user.memberId !== null;
}

export function canEditEntry(
  user: SessionUser,
  entry: { createdByUserId: string | null; memberId: string },
): boolean {
  if (isAdmin(user)) return true;
  if (entry.createdByUserId && entry.createdByUserId === user.id) return true;
  return user.memberId !== null && entry.memberId === user.memberId;
}

export function canDeleteEntry(
  user: SessionUser,
  entry: { createdByUserId: string | null; memberId: string },
): boolean {
  return canEditEntry(user, entry);
}

export function assert(condition: boolean, message?: string): void {
  if (!condition) throw forbidden(message);
}

export function assertAdmin(user: SessionUser, action = 'esta ação'): void {
  if (!isAdmin(user)) {
    throw forbidden(`Apenas o administrador pode executar ${action}.`);
  }
}

export function assertOwner(user: SessionUser, action = 'esta ação'): void {
  if (!isOwner(user)) {
    throw forbidden(`Apenas o dono da banca pode executar ${action}.`);
  }
}

export interface PermissionFlags {
  isAdmin: boolean;
  isOwner: boolean;
  canManageSettings: boolean;
  canManageGoals: boolean;
  canManageMembers: boolean;
  canManageTransactions: boolean;
  canCloseMonth: boolean;
  canOverrideRisk: boolean;
  canCreateEntry: boolean;
  canManageTips: boolean;
}

export function permissionFlags(user: SessionUser, settings: BankrollSettings): PermissionFlags {
  return {
    isAdmin: isAdmin(user),
    isOwner: isOwner(user),
    canManageSettings: canManageSettings(user),
    canManageGoals: canManageGoals(user),
    canManageMembers: canManageMembers(user),
    canManageTransactions: canManageTransactions(user),
    canCloseMonth: canCloseMonth(user),
    canOverrideRisk: canOverrideRisk(user),
    canCreateEntry: canCreateEntry(user, settings),
    canManageTips: canManageTips(user),
  };
}
