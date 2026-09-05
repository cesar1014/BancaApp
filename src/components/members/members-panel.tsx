'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteMemberAction, redistributeSharesAction } from '@/actions/members';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/modal';
import { EmptyState, Notice } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { Money, Percent, Result } from '@/components/ui/money';
import { IconEdit, IconPlus, IconTrash, IconUsers } from '@/components/icons';
import { MemberFormModal } from './member-form-modal';
import { formatBps } from '@/lib/numbers';
import type { Member } from '@/lib/domain/types';
import type { PartnerShare } from '@/lib/domain/partners';
import type { UserSummary } from '@/lib/repos/users';

export function MembersPanel({
  members,
  shares,
  totalShareBps,
  isShareValid,
  users,
  canManage,
  today,
  periodLabel,
}: {
  members: Member[];
  shares: PartnerShare[];
  totalShareBps: number;
  isShareValid: boolean;
  users: UserSummary[];
  canManage: boolean;
  today: string;
  periodLabel: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [toDelete, setToDelete] = useState<Member | null>(null);
  const [redistribute, setRedistribute] = useState(false);

  const byId = new Map(shares.map((share) => [share.memberId, share]));

  const confirmDelete = () => {
    if (!toDelete) return;
    const target = toDelete;
    startTransition(async () => {
      const result = await deleteMemberAction(target.id);
      if (result.ok) {
        toast.success('Sócio removido.');
        setToDelete(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const confirmRedistribute = () => {
    startTransition(async () => {
      const result = await redistributeSharesAction();
      if (result.ok) {
        toast.success('Participações redistribuídas conforme o capital investido.');
        setRedistribute(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      {!isShareValid ? (
        <Notice tone="warning" title="A soma das participações não é 100%" className="mb-5">
          Hoje a soma é {formatBps(totalShareBps)}. Enquanto isso, o rateio do lucro é feito
          proporcionalmente às participações informadas — ajuste os percentuais para que o cálculo
          fique correto.
        </Notice>
      ) : null}

      {canManage ? (
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setRedistribute(true)}>
            Redistribuir por capital
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <IconPlus /> Novo sócio
          </Button>
        </div>
      ) : null}

      {members.length === 0 ? (
        <EmptyState
          icon={<IconUsers />}
          title="Nenhum sócio cadastrado"
          description="Cadastre os integrantes da banca para acompanhar a participação de cada um."
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
                <IconPlus /> Adicionar sócio
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          {/* Celular: cada sócio é um cartão com a participação em destaque. */}
          <ul className="space-y-3 p-4 lg:hidden">
            {members.map((member) => {
              const share = byId.get(member.id);
              return (
                <li key={member.id} className="rounded-lg border border-line bg-elevated/45 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-bold text-ink">{member.displayName}</span>
                        {!member.isActive ? <Badge tone="muted">Inativo</Badge> : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-faint">
                        {member.userEmail ?? 'sem conta de acesso'}
                      </p>
                    </div>
                    <span className="shrink-0 text-num-lg font-extrabold tnum text-accent">
                      {formatBps(member.shareBps, 0)}
                    </span>
                  </div>

                  <dl className="mt-3.5 grid grid-cols-2 gap-3 border-t border-line pt-3">
                    <div>
                      <dt className="lbl">Lucro ({periodLabel})</dt>
                      <dd className="mt-1 text-sm">
                        <Result cents={share?.profitShareCents ?? 0} />
                      </dd>
                    </div>
                    <div className="text-right">
                      <dt className="lbl">Saldo teórico</dt>
                      <dd className="mt-1 text-sm font-bold tnum text-ink">
                        <Money cents={share?.balanceCents ?? 0} />
                      </dd>
                    </div>
                    <div>
                      <dt className="lbl">Aportes</dt>
                      <dd className="mt-1 text-sm tnum text-ink-muted">
                        <Money cents={share?.contributionsCents ?? 0} />
                      </dd>
                    </div>
                    <div className="text-right">
                      <dt className="lbl">Retiradas</dt>
                      <dd className="mt-1 text-sm tnum text-ink-muted">
                        <Money cents={share?.withdrawalsCents ?? 0} />
                      </dd>
                    </div>
                  </dl>

                  {canManage ? (
                    <div className="mt-3 flex items-center justify-end gap-1 border-t border-line pt-2.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Editar ${member.displayName}`}
                        onClick={() => {
                          setEditing(member);
                          setModalOpen(true);
                        }}
                      >
                        <IconEdit />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remover ${member.displayName}`}
                        onClick={() => setToDelete(member)}
                      >
                        <IconTrash />
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {/* Desktop: a mesma informação em tabela. */}
          <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="table-head">
                <th className="px-5 py-3 font-extrabold">Sócio</th>
                <th className="px-3 py-3 text-right font-extrabold">Participação</th>
                <th className="px-3 py-3 text-right font-extrabold">Aporte inicial</th>
                <th className="px-3 py-3 text-right font-extrabold">Aportes</th>
                <th className="px-3 py-3 text-right font-extrabold">Retiradas</th>
                <th className="px-3 py-3 text-right font-extrabold">Lucro ({periodLabel})</th>
                <th className="px-3 py-3 text-right font-extrabold">Saldo teórico</th>
                {canManage ? <th className="px-5 py-3 text-right font-extrabold">Ações</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {members.map((member) => {
                const share = byId.get(member.id);
                return (
                  <tr key={member.id} className="row-hover">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-ink">{member.displayName}</span>
                        {!member.isActive ? <Badge tone="muted">Inativo</Badge> : null}
                      </div>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        {member.userEmail ?? 'sem conta de acesso'}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <Percent bps={member.shareBps} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <Money cents={member.initialContributionCents} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <Money cents={share?.contributionsCents ?? 0} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <Money cents={share?.withdrawalsCents ?? 0} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <Result cents={share?.profitShareCents ?? 0} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-medium tnum text-ink">
                      <Money cents={share?.balanceCents ?? 0} />
                    </td>
                    {canManage ? (
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Editar sócio"
                            onClick={() => {
                              setEditing(member);
                              setModalOpen(true);
                            }}
                          >
                            <IconEdit />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Remover sócio"
                            onClick={() => setToDelete(member)}
                          >
                            <IconTrash />
                          </Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-elevated/40 text-sm font-medium">
                <td className="px-5 py-3 text-ink">Total</td>
                <td className="px-3 py-3 text-right">
                  <span className={isShareValid ? 'text-positive tnum' : 'text-warning tnum'}>
                    {formatBps(totalShareBps)}
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  <Money cents={members.reduce((acc, m) => acc + m.initialContributionCents, 0)} />
                </td>
                <td className="px-3 py-3 text-right">
                  <Money cents={shares.reduce((acc, s) => acc + s.contributionsCents, 0)} />
                </td>
                <td className="px-3 py-3 text-right">
                  <Money cents={shares.reduce((acc, s) => acc + s.withdrawalsCents, 0)} />
                </td>
                <td className="px-3 py-3 text-right">
                  <Result cents={shares.reduce((acc, s) => acc + s.profitShareCents, 0)} />
                </td>
                <td className="px-3 py-3 text-right">
                  <Money cents={shares.reduce((acc, s) => acc + s.balanceCents, 0)} />
                </td>
                {canManage ? <td /> : null}
              </tr>
            </tfoot>
          </table>
          </div>
        </>
      )}

      {canManage ? (
        <MemberFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          member={editing}
          users={users}
          today={today}
        />
      ) : null}

      <ConfirmDialog
        open={toDelete !== null}
        title="Remover sócio"
        description={
          toDelete ? (
            <>
              <strong className="text-ink">{toDelete.displayName}</strong> será removido da banca.
              Sócios com entradas registradas não podem ser removidos — nesse caso, desative-o para
              preservar o histórico.
            </>
          ) : null
        }
        confirmLabel="Remover"
        loading={pending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />

      <ConfirmDialog
        open={redistribute}
        tone="primary"
        title="Redistribuir participações"
        description="As participações dos sócios ativos serão recalculadas proporcionalmente ao capital investido (aporte inicial + aportes − retiradas). A alteração fica registrada na auditoria."
        confirmLabel="Redistribuir"
        loading={pending}
        onConfirm={confirmRedistribute}
        onCancel={() => setRedistribute(false)}
      />
    </>
  );
}
