'use server';

import { revalidatePath } from 'next/cache';
import { requireUserForAction } from '@/lib/auth/session';
import { assertAdmin } from '@/lib/auth/permissions';
import { runAllJobs, runJob, type JobName } from '@/lib/services/sports/engine';
import { toActionError, validation, type ActionResult } from '@/lib/errors';

const PATHS = ['/dicas', '/dicas/hoje', '/dicas/proximos', '/dicas/ao-vivo', '/dicas/historico', '/configuracoes'];

/** Atualização manual (administrador). Respeita os cooldowns das rotinas. */
export async function refreshTipsAction(job: JobName | 'all'): Promise<ActionResult<{ messages: string[] }>> {
  try {
    const user = await requireUserForAction();
    assertAdmin(user, 'a atualização manual da Central de Dicas');

    const allowed: (JobName | 'all')[] = ['all', 'fixtures', 'live', 'odds', 'settle', 'performance'];
    if (!allowed.includes(job)) throw validation('Rotina inválida.');

    const reports = job === 'all' ? await runAllJobs() : [await runJob(job)];
    for (const path of PATHS) revalidatePath(path);

    return {
      ok: true,
      data: { messages: reports.map((report) => `${report.job}: ${report.ran ? report.message : 'aguardando cooldown'}`) },
    };
  } catch (error) {
    return toActionError(error);
  }
}
