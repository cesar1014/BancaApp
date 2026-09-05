import 'server-only';
import { query, queryOne } from '@/lib/db';
import type { AuditLog } from '@/lib/domain/types';

interface AuditRow {
  id: string;
  bankroll_id: string | null;
  user_id: string | null;
  user_name: string;
  action: string;
  entity: string;
  entity_id: string | null;
  description: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: Date;
}

function mapAudit(row: AuditRow): AuditLog {
  return {
    id: row.id,
    bankrollId: row.bankroll_id,
    userId: row.user_id,
    userName: row.user_name,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    description: row.description,
    oldValues: row.old_values,
    newValues: row.new_values,
    createdAt: row.created_at.toISOString(),
  };
}

export interface AuditFilters {
  entity?: string | null;
  userId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  search?: string | null;
}

export async function listAuditLogs(
  bankrollId: string,
  filters: AuditFilters = {},
  pagination: { page?: number; pageSize?: number } = {},
): Promise<{ logs: AuditLog[]; total: number; page: number; pageSize: number; pageCount: number }> {
  const page = Math.max(1, pagination.page ?? 1);
  const pageSize = Math.min(Math.max(pagination.pageSize ?? 30, 5), 200);

  const conditions = ['bankroll_id = $1'];
  const params: unknown[] = [bankrollId];
  const bind = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.entity) conditions.push(`entity = ${bind(filters.entity)}`);
  if (filters.userId) conditions.push(`user_id = ${bind(filters.userId)}::uuid`);
  if (filters.dateFrom) conditions.push(`created_at >= ${bind(filters.dateFrom)}::date`);
  if (filters.dateTo) conditions.push(`created_at < (${bind(filters.dateTo)}::date + INTERVAL '1 day')`);
  const search = filters.search?.trim();
  if (search) {
    const placeholder = bind(`%${search}%`);
    conditions.push(`(description ILIKE ${placeholder} OR user_name ILIKE ${placeholder} OR action ILIKE ${placeholder})`);
  }

  const where = conditions.join(' AND ');

  const countRow = await queryOne<{ total: string }>(
    `SELECT count(*)::text AS total FROM audit_logs WHERE ${where}`,
    params,
  );
  const total = Number(countRow?.total ?? 0);

  const rows = await query<AuditRow>(
    `SELECT * FROM audit_logs WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, (page - 1) * pageSize],
  );

  return {
    logs: rows.map(mapAudit),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function insertAuditLog(input: {
  bankrollId: string | null;
  userId: string | null;
  userName: string;
  action: string;
  entity: string;
  entityId: string | null;
  description: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}): Promise<void> {
  await query(
    `INSERT INTO audit_logs
       (bankroll_id, user_id, user_name, action, entity, entity_id, description, old_values, new_values)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      input.bankrollId,
      input.userId,
      input.userName,
      input.action,
      input.entity,
      input.entityId,
      input.description,
      input.oldValues ? JSON.stringify(input.oldValues) : null,
      input.newValues ? JSON.stringify(input.newValues) : null,
    ],
  );
}

export async function listRecentActivity(bankrollId: string, limit = 8): Promise<AuditLog[]> {
  const rows = await query<AuditRow>(
    'SELECT * FROM audit_logs WHERE bankroll_id = $1 ORDER BY created_at DESC LIMIT $2',
    [bankrollId, limit],
  );
  return rows.map(mapAudit);
}
