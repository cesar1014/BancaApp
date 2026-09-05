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
import { MatchPicker, matchLabel, type MatchOption } from './match-picker';
import { MARKETS, QuickPicks, SPORTS } from './quick-picks';

const STATUS_OPTIONS: EntryStatus[] = ['OPEN', 'GREEN', 'RED', 'VOID', 'CASHOUT'];

/**
 * Registro de aposta.
 *
 * Só evento, odd e stake são obrigatórios. Esporte e mercado se resolvem por
 * um toque nos botões, o evento pode vir da lista de jogos do dia (marcar
 * mais de um monta a múltipla) e o restante fica recolhido em "Mais opções",
 * com valores padrão preenchidos pelo servidor.
 */
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
  markets,
  matches,
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
  markets: readonly string[];
  matches: readonly MatchOption[];
}) {
  const toast = useToast();
  const isEdit = Boolean(entry);

  const [state, formAction, pending] = useActionState<ActionResult<Entry> | null, FormData>(
    isEdit ? updateEntryAction : createEntryAction,
    null,
  );

  const [status, setStatus] = useState<EntryStatus>(entry?.status ?? 'OPEN');
  const [stake, setStake] = useState('');
  const [odd, setOdd] = useState('');
  const [payout, setPayout] = useState('');
  const [date, setDate] = useState(entry?.occurredOn ?? defaultDate);
  const [sport, setSport] = useState(entry?.sport ?? 'Futebol');
  const [market, setMarket] = useState(entry?.market ?? '');
  const [event, setEvent] = useState(entry?.event ?? '');
  const [picked, setPicked] = useState<MatchOption[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [risk, setRisk] = useState<RiskEvaluation | null>(null);
  const [, startRiskCheck] = useTransition();

  // Reinicia o formulário sempre que o modal abre com outra entrada.
  useEffect(() => {
    if (!open) return;
    setStatus(entry?.status ?? 'OPEN');
    setStake(entry ? centsToReals(entry.stakeCents).toFixed(2).replace('.', ',') : '');
    setOdd(entry ? String(entry.oddMilli / 1000).replace('.', ',') : '');
    setPayout(entry && entry.status === 'CASHOUT' ? centsToReals(entry.payoutCents).toFixed(2).replace('.', ',') : '');
    setDate(entry?.occurredOn ?? defaultDate);
    setSport(entry?.sport ?? 'Futebol');
    setMarket(entry?.market ?? '');
    setEvent(entry?.event ?? '');
    setPicked([]);
    setShowMore(false);
    setRisk(null);
  }, [open, entry, defaultDate]);

  // Escolher jogos preenche o evento; escrever à mão continua valendo.
  useEffect(() => {
    if (picked.length === 0) return;
    setEvent(picked.map(matchLabel).join(' + '));
  }, [picked]);

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
        const result = await previewRiskAction({ date, stake, ...(entry ? { entryId: entry.id } : {}) });
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
  const isMultiple = picked.length > 1;
  const marketSuggestions = useMemo(
    () => [...MARKETS, ...markets.filter((m) => !MARKETS.some((d) => d.toLowerCase() === m.toLowerCase()))].slice(0, 14),
    [markets],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Editar entrada' : 'Nova entrada'}
      description={
        isEdit
          ? 'O lucro é sempre recalculado pelo servidor a partir de stake, odd e status.'
          : `Preencha evento, odd e stake. O resto é opcional. Stake máxima: ${formatMoney(maxStakeCents)}.`
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
      <form id="entry-form" action={formAction} className="space-y-5" noValidate>
        {entry ? <input type="hidden" name="entryId" value={entry.id} /> : null}
        {state && !state.ok ? <Notice tone="danger" title={state.error} /> : null}

        {/* ---------------------------------------------------------------- */}
        {/* Evento: lista de jogos do dia ou texto livre                      */}
        {/* ---------------------------------------------------------------- */}
        <div className="space-y-2.5">
          <Field label="Evento" htmlFor="event" error={details?.event} required>
            <Input
              id="event"
              name="event"
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              placeholder="Palmeiras x Santos"
              required
            />
          </Field>
          {!isEdit ? <MatchPicker matches={matches} selected={picked} onChange={setPicked} /> : null}
          {isMultiple ? (
            <p className="text-xs text-accent">
              Múltipla de {picked.length} jogos. Informe a odd combinada e o valor total apostado.
            </p>
          ) : null}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Odd, stake e status: o núcleo do registro                         */}
        {/* ---------------------------------------------------------------- */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Odd" htmlFor="odd" error={details?.odd} required>
            <Input
              id="odd"
              name="odd"
              inputMode="decimal"
              value={odd}
              onChange={(e) => setOdd(e.target.value)}
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
              onChange={(e) => setStake(e.target.value)}
              placeholder="50,00"
              invalid={overLimit}
              required
            />
          </Field>
          <Field label="Status" htmlFor="status" error={details?.status}>
            <Select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value as EntryStatus)}>
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
              onChange={(e) => setPayout(e.target.value)}
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
              <p className="text-2xs uppercase tracking-wider text-ink-faint">Resultado calculado</p>
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
              <p className="text-2xs text-ink-faint">Retorno {formatMoney(preview.payoutCents)}</p>
            </div>
          </div>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* Mercado e esporte: um toque, sem digitar                          */}
        {/* ---------------------------------------------------------------- */}
        <div className="space-y-2.5">
          <Field label="Mercado" htmlFor="market" error={details?.market} hint="Opcional. Toque numa sugestão ou escreva.">
            <Input
              id="market"
              name="market"
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              placeholder={isMultiple ? `Múltipla de ${picked.length} seleções` : 'Over 1.5 gols'}
            />
          </Field>
          <QuickPicks options={marketSuggestions} value={market} onPick={setMarket} ariaLabel="Mercados sugeridos" />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Tudo o mais tem valor padrão                                       */}
        {/* ---------------------------------------------------------------- */}
        <div className="rounded-md border border-line bg-elevated/40">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-extrabold uppercase tracking-[0.12em] text-ink-faint transition-colors hover:text-ink"
          >
            <span>Mais opções · esporte, data, hora, responsável</span>
            <span className={showMore ? 'rotate-180 transition-transform' : 'transition-transform'}>▾</span>
          </button>

          {showMore ? (
            <div className="space-y-4 border-t border-line px-4 pb-4 pt-4">
              <div className="space-y-2.5">
                <Field label="Esporte" htmlFor="sport" error={details?.sport} hint="Sem escolha, fica Futebol.">
                  <Input id="sport" name="sport" value={sport} onChange={(e) => setSport(e.target.value)} placeholder="Futebol" />
                </Field>
                <QuickPicks options={SPORTS} value={sport} onPick={setSport} ariaLabel="Esportes" />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Data" htmlFor="occurredOn" error={details?.occurredOn}>
                  <Input id="occurredOn" name="occurredOn" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label="Hora" htmlFor="occurredAtTime" error={details?.occurredAtTime}>
                  <Input
                    id="occurredAtTime"
                    name="occurredAtTime"
                    type="time"
                    defaultValue={entry?.occurredAtTime.slice(0, 5) ?? defaultTime}
                  />
                </Field>
                <Field label="Responsável" htmlFor="memberId" error={details?.memberId}>
                  <Select id="memberId" name="memberId" defaultValue={entry?.memberId ?? defaultMemberId ?? ''}>
                    <option value="">Quem está registrando</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="Observação" htmlFor="note" error={details?.note}>
                <Textarea
                  id="note"
                  name="note"
                  defaultValue={entry?.note ?? ''}
                  placeholder="Contexto da entrada, linha de raciocínio, casa de apostas..."
                  rows={2}
                />
              </Field>
            </div>
          ) : null}
        </div>

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
              <p className="mt-2">Esta stake consome {formatBps(risk.stake.usageBps, 0)} do limite por entrada.</p>
            ) : null}
          </Notice>
        ) : null}

        {overLimit && canOverrideRisk ? (
          <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/[0.08] p-4">
            <label className="flex items-start gap-2.5 text-sm">
              <input type="hidden" name="confirmRisk" value="false" />
              <input type="checkbox" name="confirmRisk" value="true" className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-warning))]" />
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
      </form>
    </Modal>
  );
}
