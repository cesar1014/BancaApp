import 'server-only';
import { insertAuditLog } from '@/lib/repos/audit';
import type { SessionUser } from '@/lib/domain/types';

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'ENTRY_CREATE'
  | 'ENTRY_UPDATE'
  | 'ENTRY_DELETE'
  | 'TRANSACTION_CREATE'
  | 'TRANSACTION_UPDATE'
  | 'TRANSACTION_DELETE'
  | 'MEMBER_CREATE'
  | 'MEMBER_UPDATE'
  | 'MEMBER_DELETE'
  | 'MEMBER_SHARES_UPDATE'
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_PASSWORD_RESET'
  | 'SETTINGS_UPDATE'
  | 'MONTHLY_GOAL_UPDATE'
  | 'MONTH_CLOSE'
  | 'MONTH_REOPEN'
  | 'RISK_OVERRIDE';

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  LOGIN: 'Entrou no sistema',
  LOGOUT: 'Saiu do sistema',
  ENTRY_CREATE: 'Cadastrou entrada',
  ENTRY_UPDATE: 'Alterou entrada',
  ENTRY_DELETE: 'Excluiu entrada',
  TRANSACTION_CREATE: 'Registrou movimentação',
  TRANSACTION_UPDATE: 'Alterou movimentação',
  TRANSACTION_DELETE: 'Excluiu movimentação',
  MEMBER_CREATE: 'Adicionou sócio',
  MEMBER_UPDATE: 'Alterou sócio',
  MEMBER_DELETE: 'Removeu sócio',
  MEMBER_SHARES_UPDATE: 'Redistribuiu participações',
  USER_CREATE: 'Criou usuário',
  USER_UPDATE: 'Alterou usuário',
  USER_PASSWORD_RESET: 'Redefiniu senha',
  SETTINGS_UPDATE: 'Alterou configurações',
  MONTHLY_GOAL_UPDATE: 'Alterou meta do mês',
  MONTH_CLOSE: 'Fechou o mês',
  MONTH_REOPEN: 'Reabriu o mês',
  RISK_OVERRIDE: 'Autorizou entrada acima do limite',
};

export const AUDIT_ENTITIES = [
  'entry',
  'transaction',
  'member',
  'user',
  'settings',
  'monthly_goal',
  'monthly_closing',
  'session',
] as const;

export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export const AUDIT_ENTITY_LABEL: Record<AuditEntity, string> = {
  entry: 'Entrada',
  transaction: 'Movimentação',
  member: 'Sócio',
  user: 'Usuário',
  settings: 'Configurações',
  monthly_goal: 'Meta mensal',
  monthly_closing: 'Fechamento',
  session: 'Sessão',
};

/**
 * Registra uma ação na trilha de auditoria.
 * Nunca deixa a auditoria derrubar a operação principal: se o log falhar, o
 * erro é reportado no servidor mas a ação do usuário permanece válida.
 */
export async function recordAudit(params: {
  user: Pick<SessionUser, 'id' | 'name'> | null;
  bankrollId: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string | null;
  description: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await insertAuditLog({
      bankrollId: params.bankrollId,
      userId: params.user?.id ?? null,
      userName: params.user?.name ?? 'Sistema',
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      description: params.description,
      oldValues: params.oldValues ?? null,
      newValues: params.newValues ?? null,
    });
  } catch (error) {
    console.error('[audit] falha ao gravar log', error);
  }
}

/** Compara dois objetos e devolve apenas os campos que mudaram. */
export function diffValues<T extends Record<string, unknown>>(
  before: T,
  after: T,
): { old: Record<string, unknown>; new: Record<string, unknown> } | null {
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  let changed = false;

  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      oldValues[key] = a ?? null;
      newValues[key] = b ?? null;
      changed = true;
    }
  }

  return changed ? { old: oldValues, new: newValues } : null;
}
