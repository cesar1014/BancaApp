import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext } from '@/lib/services/context';
import { listAuditLogs } from '@/lib/repos/audit';
import { listUsers } from '@/lib/repos/users';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/feedback';
import { Pagination } from '@/components/ui/pagination';
import { IconAudit } from '@/components/icons';
import { AUDIT_ACTION_LABEL, AUDIT_ENTITIES, AUDIT_ENTITY_LABEL, type AuditAction, type AuditEntity } from '@/lib/audit';
import { formatDateTimeBR, isIsoDate } from '@/lib/datetime';
import { first } from '@/lib/period';

export const metadata: Metadata = { title: 'Auditoria' };
export const dynamic = 'force-dynamic';

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const params = await searchParams;

  const entity = first(params.entidade) ?? '';
  const userId = first(params.usuario) ?? '';
  const dateFrom = first(params.de) ?? '';
  const dateTo = first(params.ate) ?? '';
  const search = first(params.busca) ?? '';
  const page = Math.max(Number(first(params.pagina) ?? '1') || 1, 1);

  const [result, users] = await Promise.all([
    listAuditLogs(
      context.bankroll.id,
      {
        entity: (AUDIT_ENTITIES as readonly string[]).includes(entity) ? entity : null,
        userId: userId || null,
        dateFrom: isIsoDate(dateFrom) ? dateFrom : null,
        dateTo: isIsoDate(dateTo) ? dateTo : null,
        search: search || null,
      },
      { page, pageSize: 30 },
    ),
    listUsers(),
  ]);

  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Registro de tudo que altera dinheiro, configuração ou permissão: quem fez, quando, e qual era o valor antes e depois."
      />

      <Card className="mb-5">
        <CardHeader title="Filtros" />
        <CardBody>
          <form method="get" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="De" htmlFor="de">
                <Input id="de" name="de" type="date" defaultValue={dateFrom} />
              </Field>
              <Field label="Até" htmlFor="ate">
                <Input id="ate" name="ate" type="date" defaultValue={dateTo} />
              </Field>
              <Field label="Tipo de registro" htmlFor="entidade">
                <Select id="entidade" name="entidade" defaultValue={entity}>
                  <option value="">Todos</option>
                  {AUDIT_ENTITIES.map((item) => (
                    <option key={item} value={item}>
                      {AUDIT_ENTITY_LABEL[item]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Usuário" htmlFor="usuario">
                <Select id="usuario" name="usuario" defaultValue={userId}>
                  <option value="">Todos</option>
                  {users.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Buscar" htmlFor="busca">
                <Input id="busca" name="busca" defaultValue={search} placeholder="descrição, ação..." />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="submit" variant="primary" size="sm">
                Aplicar
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Atividades"
          description={`${result.total} registro(s). Mais recentes primeiro.`}
        />
        {result.logs.length === 0 ? (
          <EmptyState
            icon={<IconAudit />}
            title="Nenhuma atividade encontrada"
            description="As ações realizadas no sistema aparecem aqui automaticamente."
          />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {result.logs.map((log) => {
                const changes = buildChanges(log.oldValues, log.newValues);
                return (
                  <li key={log.id} className="px-5 py-4 transition-colors hover:bg-elevated/40">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-ink">{log.userName}</span>
                          <Badge tone={toneFor(log.action as AuditAction)}>
                            {AUDIT_ACTION_LABEL[log.action as AuditAction] ?? log.action}
                          </Badge>
                          <Badge tone="muted">
                            {AUDIT_ENTITY_LABEL[log.entity as AuditEntity] ?? log.entity}
                          </Badge>
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                          {log.description}
                        </p>

                        {changes.length > 0 ? (
                          <ul className="mt-2.5 space-y-1">
                            {changes.map((change) => (
                              <li key={change.field} className="text-xs">
                                <span className="text-ink-faint">{prettyField(change.field)}: </span>
                                <span className="text-negative line-through decoration-negative/40">
                                  {change.before}
                                </span>
                                <span className="mx-1.5 text-ink-faint">→</span>
                                <span className="text-positive">{change.after}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                      <time
                        className="shrink-0 text-xs tnum text-ink-faint"
                        dateTime={log.createdAt}
                      >
                        {formatDateTimeBR(log.createdAt, context.bankroll.timezone)}
                      </time>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pagination
              page={result.page}
              pageCount={result.pageCount}
              total={result.total}
              pageSize={result.pageSize}
            />
          </>
        )}
      </Card>
    </>
  );
}

function toneFor(action: AuditAction): 'positive' | 'negative' | 'warning' | 'accent' | 'neutral' {
  if (action.endsWith('_DELETE')) return 'negative';
  if (action.endsWith('_CREATE')) return 'positive';
  if (action === 'RISK_OVERRIDE' || action === 'MONTH_REOPEN') return 'warning';
  if (action === 'LOGIN' || action === 'LOGOUT') return 'neutral';
  return 'accent';
}

function buildChanges(
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
): { field: string; before: string; after: string }[] {
  if (!oldValues && !newValues) return [];
  const fields = new Set([...Object.keys(oldValues ?? {}), ...Object.keys(newValues ?? {})]);
  if (!oldValues || !newValues) return [];

  return Array.from(fields).map((field) => ({
    field,
    before: display(oldValues[field]),
    after: display(newValues[field]),
  }));
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'sim' : 'não';
  return String(value);
}

function prettyField(field: string): string {
  return field.replace(/_/g, ' ');
}
