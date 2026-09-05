'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { clearMonthlyGoalAction, saveMonthlyGoalAction } from '@/actions/settings';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Notice } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { centsToReals, formatMoney, parseMoneyToCents } from '@/lib/money';
import { formatMonthLabel } from '@/lib/datetime';
import type { ActionResult } from '@/lib/errors';

/** Ajuste da meta de um mês específico, sem alterar as configurações gerais. */
export function MonthlyGoalForm({
  year,
  month,
  goalCents,
  activeDays,
  targetBankrollCents,
  isOverride,
}: {
  year: number;
  month: number;
  goalCents: number;
  activeDays: number;
  targetBankrollCents: number;
  isOverride: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [clearing, startClearing] = useTransition();
  const [state, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    saveMonthlyGoalAction,
    null,
  );

  const [goal, setGoal] = useState(centsToReals(goalCents).toFixed(2).replace('.', ','));
  const [days, setDays] = useState(String(activeDays));

  useEffect(() => {
    if (!open) return;
    setGoal(centsToReals(goalCents).toFixed(2).replace('.', ','));
    setDays(String(activeDays));
  }, [open, goalCents, activeDays]);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success('Meta do mês atualizada.');
      setOpen(false);
      router.refresh();
    } else {
      toast.error(state.error);
    }
  }, [state, router, toast]);

  const parsedGoal = parseMoneyToCents(goal) ?? 0;
  const parsedDays = Math.max(Number(days) || 1, 1);
  const dailyPreview = Math.round(parsedGoal / parsedDays);

  const details = state && !state.ok ? state.details : undefined;

  const clear = () => {
    startClearing(async () => {
      const result = await clearMonthlyGoalAction(year, month);
      if (result.ok) {
        toast.success('Meta específica removida. O mês volta a usar as configurações gerais.');
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Ajustar meta do mês
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={`Meta de ${formatMonthLabel(year, month)}`}
        description="Vale apenas para este mês. As configurações gerais continuam intactas."
        footer={
          <>
            {isOverride ? (
              <Button variant="danger" onClick={clear} loading={clearing}>
                Voltar ao padrão
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" form="monthly-goal-form" variant="primary" loading={pending}>
              Salvar
            </Button>
          </>
        }
      >
        <form id="monthly-goal-form" action={formAction} className="space-y-4" noValidate>
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="month" value={month} />

          {state && !state.ok ? <Notice tone="danger" title={state.error} /> : null}

          <Field label="Meta de lucro do mês (R$)" htmlFor="goal" error={details?.goal} required>
            <Input
              id="goal"
              name="goal"
              inputMode="decimal"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              required
            />
          </Field>

          <Field
            label="Dias ativos"
            htmlFor="activeDays"
            error={details?.activeDays}
            hint={`Meta diária resultante: ${formatMoney(dailyPreview)}`}
            required
          >
            <Input
              id="activeDays"
              name="activeDays"
              type="number"
              min={1}
              max={31}
              value={days}
              onChange={(event) => setDays(event.target.value)}
              required
            />
          </Field>

          <Field
            label="Banca-alvo ao fim do mês (R$)"
            htmlFor="targetBankroll"
            error={details?.targetBankroll}
            required
          >
            <Input
              id="targetBankroll"
              name="targetBankroll"
              inputMode="decimal"
              defaultValue={centsToReals(targetBankrollCents).toFixed(2).replace('.', ',')}
              required
            />
          </Field>

          <p className="text-xs leading-relaxed text-ink-muted">
            A meta é uma referência de acompanhamento. Não existe obrigação de bater a meta diária —
            e o sistema jamais sugere aumentar stake para compensar diferença.
          </p>
        </form>
      </Modal>
    </>
  );
}
