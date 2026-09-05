'use client';

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import { createEntryAction, previewRiskAction, updateEntryAction } from '@/actions/entries';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Notice } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { computeEntryResult } from '@/lib/domain/entry';
import { parseMoneyToCents, formatMoney, formatMoneySigned, centsToReals } from '@/lib/money';
import { parseOddToMilli, formatBps } from '@/lib/numbers';
import { ENTRY_STATUS_LABEL, type Entry, type EntryStatus, type Member } from '@/lib/domain/types';
import type { ActionResult } from '@/lib/errors';
import type { RiskEvaluation } from '@/lib/domain/risk';

const STATUS_OPTIONS: EntryStatus[] = ['OPEN', 'GREEN', 'RED', 'VOID', 'CASHOUT'];

export function EntryFormModal({
  open,
  onClose,
  members,
  entry,
  defaultDate,
  defaultTime,
  defaultMemberId,
  canOverrideRisk,
  maxStakeCents,
  sports,
  markets,
}: {
  open: boolean;
  onClose: () => void;
  members: readonly Member[];
  entry?: Entry | null;
  defaultDate: string;
  defaultTime: string;
  defaultMemberId?: string | null;
  canOverrideRisk: boolean;
  maxStakeCents: number;
  sports: readonly string[];
  markets: readonly string[];
}) {
  const toast = useToast();
  const isEdit = Boolean(entry);

  const [state, formAction, pending] = useActionState<ActionResult<Entry> | null, FormData>(
    isEdit ? updateEntryAction : createEntryAction,
    null,
  );

  const [status, setStatus] = useState<EntryStatus>(entry?.status ?? 'OPEN');
  const [stake, setStake] = useState(entry ? String(centsToReals(entry.stakeCents).toFixed(2)).replace('.', ',') : '');
  const [odd, setOdd] = useState(entry ? String(entry.oddMilli / 1000).replace('.', ',') : '');
  const [payout, setPayout] = useState(
    entry && entry.status === 'CASHOUT'
      ? String(centsToReals(entry.payoutCents).toFixed(2)).replace('.', ',')
      : '',
  );
  const [date, setDate] = useState(entry?.occurredOn ?? defaultDate);
  const [risk, setRisk] = useState<RiskEvaluation | null>(null);
  const [, startRiskCheck] = useTransition();

  // Reinicia o formulário sempre que o modal abre com outra entrada.
  useEffect(() => {
    if (!open) return;
    setStatus(entry?.status ?? 'OPEN');
    setStake(entry ? centsToReals(entry.stakeCents).toFixed(2).replace('.', ',') : '');
    setOdd(entry ? String(entry.oddMilli / 1000).replace('.', ',') : '');
    setPayout(
      entry && entry.status === 'CASHOUT'
        ? centsToReals(entry.payoutCents).toFixed(2).replace('.', ',')
        : '',
    );
    setDate(entry?.occurredOn ?? defaultDate);
    setRisk(null);
  }, [open, entry, defaultDate]);

  // Fecha e avisa quando a ação conclui.
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(isEdit ? 'Entrada atualizada.' : 'Entrada registrada.');
      for (const warning of state.warnings ?? []) toast.warning('Atenção', warning);
      onClose();
    } else if (state.code !== 'VALIDATION') {
      toast.error(state.error);
    }
  }, [state, isEdit, onClose, toast]);

  // Consulta o risco no servidor quando stake ou data mudam (a interface só
  // exibe; quem decide de verdade é o servidor, no momento de salvar).
  useEffect(() => {
    if (!open) return undefined;
    const stakeCents = parseMoneyToCents(stake);
    if (stakeCents === null || stakeCents <= 0) {
      setRisk(null);
      return undefined;
    }

    const timer = setTimeout(() => {
      startRiskCheck(async () => {
        const result = await previewRiskAction({
          date,
          stake,
          ...(entry ? { entryId: entry.id } : {}),
        });
        setRisk(result.ok ? result.data : null);
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [open, stake, date, entry]);

  const preview = useMemo(() => {
    const stakeCents = parseMoneyToCents(stake);
    const oddMilli = parseOddToMilli(odd);
    const payoutCents = parseMoneyToCents(payout);
    if (stakeCents === null || stakeCents <= 0 || oddMilli === null || oddMilli <= 1000) return null;

    try {
      return computeEntryResult({
        status,
        stakeCents,
        oddMilli,
        payoutCents: status === 'CASHOUT' ? payoutCents : null,
      });
    } catch {
      return null;
    }
  }, [stake, odd, payout, status]);

  const details = state && !state.ok ? state.details : undefined;
  const overLimit = (risk?.stake.usageBps ?? 0) > 10_000;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Editar entrada' : 'Nova entrada'}
      description={
        isEdit
          ? 'O lucro é sempre recalculado pelo servidor a partir de stake, odd e status.'
          : `Stake máxima configurada: ${formatMoney(maxStakeCents)}.`
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="entry-form" variant="primary" loading={pending}>
            {isEdit ? 'Salvar alterações' : 'Registrar entrada'}
          </Button>
        </>
      }
    >
      <form id="entry-form" action={formAction} className="space-y-4" noValidate>
        {entry ? <input type="hidden" name="entryId" value={entry.id} /> : null}

        {state && !state.ok ? <Notice tone="danger" title={state.error} /> : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Data" htmlFor="occurredOn" error={details?.occurredOn} required>
            <Input
              id="occurredOn"
              name="occurredOn"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </Field>
          <Field label="Hora" htmlFor="occurredAtTime" error={details?.occurredAtTime} required>
            <Input
              id="occurredAtTime"
              name="occurredAtTime"
              type="time"
              defaultValue={entry?.occurredAtTime.slice(0, 5) ?? defaultTime}
              required
            />
          </Field>
          <Field label="Responsável" htmlFor="memberId" error={details?.memberId} required>
            <Select
              id="memberId"
              name="memberId"
              defaultValue={entry?.memberId ?? defaultMemberId ?? members[0]?.id ?? ''}
              required
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Esporte" htmlFor="sport" error={details?.sport} required>
            <Input
              id="sport"
              name="sport"
              list="entry-sports"
              defaultValue={entry?.sport ?? ''}
              placeholder="Futebol"
              required
            />
            <datalist id="entry-sports">
              {sports.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </Field>
          <Field
            label="Evento"
            htmlFor="event"
            error={details?.event}
            className="sm:col-span-2"
            required
          >
            <Input
              id="event"
              name="event"
              defaultValue={entry?.event ?? ''}
              placeholder="Palmeiras x Santos"
              required
            />
          </Field>
        </div>

        <Field label="Mercado" htmlFor="market" error={details?.market} required>
          <Input
            id="market"
            name="market"
            list="entry-markets"
            defaultValue={entry?.market ?? ''}
            placeholder="Over 1.5 gols"
            required
          />
          <datalist id="entry-markets">
            {markets.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Odd" htmlFor="odd" error={details?.odd} required>
            <Input
              id="odd"
              name="odd"
              inputMode="decimal"
              value={odd}
              onChange={(event) => setOdd(event.target.value)}
              placeholder="2,15"
              required
            />
          </Field>
          <Field
            label="Stake (R$)"
            htmlFor="stake"
            error={details?.stake}
            hint={`Limite: ${formatMoney(maxStakeCents)}`}
            required
          >
            <Input
              id="stake"
              name="stake"
              inputMode="decimal"
              value={stake}
              onChange={(event) => setStake(event.target.value)}
              placeholder="50,00"
              invalid={overLimit}
              required
            />
          </Field>
          <Field label="Status" htmlFor="status" error={details?.status} required>
            <Select
              id="status"
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value as EntryStatus)}
              required
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {ENTRY_STATUS_LABEL[option]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {status === 'CASHOUT' ? (
          <Field
            label="Retorno recebido no cashout (R$)"
            htmlFor="payout"
            error={details?.payout}
            hint="Valor efetivamente creditado ao encerrar a aposta."
            required
          >
            <Input
              id="payout"
              name="payout"
              inputMode="decimal"
              value={payout}
              onChange={(event) => setPayout(event.target.value)}
              placeholder="72,00"
              required
            />
          </Field>
        ) : (
          <input type="hidden" name="payout" value="" />
        )}

        {preview ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-elevated/50 px-4 py-3">
            <div>
              <p className="text-2xs uppercase tracking-wider text-ink-faint">
                Resultado calculado
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {status === 'OPEN'
                  ? 'A entrada em aberto não movimenta a banca.'
                  : status === 'GREEN'
                    ? 'stake × (odd − 1)'
                    : status === 'RED'
                      ? '− stake'
                      : status === 'VOID'
                        ? 'stake devolvida'
                        : 'retorno − stake'}
              </p>
            </div>
            <div className="text-right">
              <p
                className={
                  preview.profitCents > 0
                    ? 'text-lg font-semibold tnum text-positive'
                    : preview.profitCents < 0
                      ? 'text-lg font-semibold tnum text-negative'
                      : 'text-lg font-semibold tnum text-ink-muted'
                }
              >
                {formatMoneySigned(preview.profitCents)}
              </p>
              <p className="text-2xs text-ink-faint">
                Retorno {formatMoney(preview.payoutCents)}
              </p>
            </div>
          </div>
        ) : null}

        {risk && (risk.blockingMessages.length > 0 || risk.warningMessages.length > 0) ? (
          <Notice
            tone={risk.level === 'BLOCK' ? 'danger' : 'warning'}
            title={risk.level === 'BLOCK' ? 'Fora do limite de risco' : 'Aviso de risco'}
          >
            <ul className="space-y-1">
              {[...risk.blockingMessages, ...risk.warningMessages].map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
            {risk.stake.usageBps !== null ? (
              <p className="mt-2">
                Esta stake consome {formatBps(risk.stake.usageBps, 0)} do limite por entrada.
              </p>
            ) : null}
          </Notice>
        ) : null}

        {overLimit && canOverrideRisk ? (
          <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/8 p-4">
            <label className="flex items-start gap-2.5 text-sm">
              <input type="hidden" name="confirmRisk" value="false" />
              <input
                type="checkbox"
                name="confirmRisk"
                value="true"
                className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-warning))]"
              />
              <span className="text-ink">
                Autorizo esta entrada acima do limite configurado
                <span className="mt-0.5 block text-xs text-ink-muted">
                  A entrada ficará marcada como exceção e o registro vai para a auditoria.
                </span>
              </span>
            </label>
            <Field label="Motivo da exceção" htmlFor="riskOverrideReason">
              <Input
                id="riskOverrideReason"
                name="riskOverrideReason"
                defaultValue={entry?.riskOverrideReason ?? ''}
                placeholder="Ex.: valor combinado previamente com o grupo"
              />
            </Field>
          </div>
        ) : null}

        <Field label="Observação" htmlFor="note" error={details?.note}>
          <Textarea
            id="note"
            name="note"
            defaultValue={entry?.note ?? ''}
            placeholder="Contexto da entrada, linha de raciocínio, casa de apostas..."
          />
        </Field>
      </form>
    </Modal>
  );
}
