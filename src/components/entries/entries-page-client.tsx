'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { IconPlus } from '@/components/icons';
import { EntriesTable } from './entries-table';
import { EntryFormModal } from './entry-form-modal';
import type { Entry, Member, SessionUser } from '@/lib/domain/types';
import type { MatchOption } from './match-picker';

/**
 * Une a tabela ao formulário: a página continua sendo Server Component e este
 * cliente só cuida do estado de modal.
 */
export function EntriesPageClient({
  user,
  entries,
  members,
  canCreate,
  canOverrideRisk,
  maxStakeCents,
  today,
  now,
  markets,
  matches,
}: {
  user: SessionUser;
  entries: Entry[];
  members: Member[];
  canCreate: boolean;
  canOverrideRisk: boolean;
  maxStakeCents: number;
  today: string;
  now: string;
  markets: string[];
  matches: MatchOption[];
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (entry: Entry) => {
    setEditing(entry);
    setOpen(true);
  };

  return (
    <>
      {canCreate ? (
        <div className="mb-4 flex justify-end">
          <Button variant="primary" onClick={openCreate}>
            <IconPlus /> Nova entrada
          </Button>
        </div>
      ) : null}

      <EntriesTable
        entries={entries}
        permissions={{ userId: user.id, memberId: user.memberId, isAdmin: user.role === 'ADMIN' }}
        onEdit={openEdit}
        emptyAction={
          canCreate ? (
            <Button variant="primary" size="sm" onClick={openCreate}>
              <IconPlus /> Registrar entrada
            </Button>
          ) : null
        }
      />

      {canCreate || editing ? (
        <EntryFormModal
          open={open}
          onClose={() => setOpen(false)}
          entry={editing}
          members={members}
          defaultDate={today}
          defaultTime={now}
          defaultMemberId={user.memberId}
          canOverrideRisk={canOverrideRisk}
          maxStakeCents={maxStakeCents}
          markets={markets}
          matches={matches}
        />
      ) : null}
    </>
  );
}
