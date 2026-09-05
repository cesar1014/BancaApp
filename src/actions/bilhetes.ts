'use server';

import { revalidatePath } from 'next/cache';
import { requireUserForAction } from '@/lib/auth/session';
import { assertAdmin } from '@/lib/auth/permissions';
import { collectAllSources, settleLegManually } from '@/lib/services/bilhetes.service';
import { setSourceActive } from '@/lib/repos/bilhetes';
import { recordAudit } from '@/lib/audit';
import { toActionError, validation, type ActionResult } from '@/lib/errors';
import type { TipResult } from '@/lib/sports/domain/models';

const PATHS = ['/bilhetes', '/bilhetes/proximos', '/bilhetes/historico', '/bilhetes/fontes'];

function revalidateAll(): void {
  for (const path of PATHS) revalidatePath(path);
}

/** Coleta manual (administrador). Ignora o cooldown das fontes. */
export async function collectSlipsAction(): Promise<ActionResult<{ messages: string[] }>> {
  try {
    const user = await requireUserForAction();
    assertAdmin(user, 'a coleta de bilhetes');
    const reports = await collectAllSources({ force: true });
    revalidateAll();
    return { ok: true, data: { messages: reports.map((r) => `${r.slug}: ${r.message}`) } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function toggleSourceAction(slug: string, active: boolean): Promise<ActionResult<null>> {
  try {
    const user = await requireUserForAction();
    assertAdmin(user, 'a ativação de fontes');
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) throw validation('Fonte inválida.');
    await setSourceActive(slug, active);
    await recordAudit({
      user,
      bankrollId: user.bankrollId,
      action: 'SETTINGS_UPDATE',
      entity: 'settings',
      entityId: null,
      description: `${active ? 'Ligou' : 'Desligou'} a fonte de bilhetes ${slug}`,
    });
    revalidateAll();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/** Conferência manual de uma perna que o sistema não conseguiu decidir. */
export async function settleLegAction(legId: string, result: TipResult): Promise<ActionResult<null>> {
  try {
    const user = await requireUserForAction();
    assertAdmin(user, 'a conferência manual de bilhetes');
    if (!/^[0-9a-f-]{36}$/.test(legId)) throw validation('Perna inválida.');
    if (result !== 'GREEN' && result !== 'RED' && result !== 'PUSH') throw validation('Resultado inválido.');
    await settleLegManually(legId, result);
    revalidateAll();
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
