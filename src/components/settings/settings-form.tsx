'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateSettingsAction } from '@/actions/settings';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { Notice } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { centsToReals, formatMoney, parseMoneyToCents } from '@/lib/money';
import { applyBps, parsePercentToBps } from '@/lib/numbers';
import type { ActionResult } from '@/lib/errors';
import type { Bankroll, BankrollSettings } from '@/lib/domain/types';

const TIMEZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Belem',
  'America/Fortaleza',
  'America/Cuiaba',
  'America/Campo_Grande',
  'America/Rio_Branco',
  'America/Noronha',
  'UTC',
];

const money = (cents: number) => centsToReals(cents).toFixed(2).replace('.', ',');
const percent = (bps: number) => String(bps / 100).replace('.', ',');

export function SettingsForm({
  bankroll,
  settings,
  currentBankrollCents,
  monthStartBankrollCents,
  readOnly,
  goalsReadOnly,
}: {
  bankroll: Bankroll;
  settings: BankrollSettings;
  currentBankrollCents: number;
  monthStartBankrollCents: number;
  readOnly: boolean;
  /** Banca inicial e metas: somente o dono da banca altera. */
  goalsReadOnly: boolean;
}) {
  // Campos de meta ficam travados para quem não é o dono, mesmo sendo admin.
  const goalsLocked = readOnly || goalsReadOnly;
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    updateSettingsAction,
    null,
  );

  const [goalMode, setGoalMode] = useState(settings.dailyGoalMode);
  const [monthlyGoal, setMonthlyGoal] = useState(money(settings.monthlyGoalCents));
  const [activeDays, setActiveDays] = useState(String(settings.activeDays));
  const [riskBase, setRiskBase] = useState(settings.riskBase);
  const [riskPercent, setRiskPercent] = useState(percent(settings.maxRiskPerEntryBps));
  const [dailyStop, setDailyStop] = useState(percent(settings.dailyStopBps));
  const [weeklyStop, setWeeklyStop] = useState(percent(settings.weeklyStopBps));
  const [monthlyStop, setMonthlyStop] = useState(percent(settings.monthlyStopBps));
  const [initialBankroll, setInitialBankroll] = useState(money(settings.initialBankrollCents));
  const [dailyGoal, setDailyGoal] = useState(money(settings.dailyGoalCents));

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      if (state.warnings?.length) toast.warning(state.warnings[0] ?? 'Configurações salvas.');
      else toast.success('Configurações salvas.');
      router.refresh();
    } else if (state.code !== 'VALIDATION') {
      toast.error(state.error);
    }
  }, [state, router, toast]);

  const details = state && !state.ok ? state.details : undefined;

  // Prévia dos limites com os valores digitados agora.
  const baseCents =
    riskBase === 'CURRENT'
      ? currentBankrollCents
      : riskBase === 'MONTH_START'
        ? monthStartBankrollCents
        : (parseMoneyToCents(initialBankroll) ?? settings.initialBankrollCents);

  const preview = {
    stake: applyBps(baseCents, parsePercentToBps(riskPercent) ?? 0),
    daily: applyBps(baseCents, parsePercentToBps(dailyStop) ?? 0),
    weekly: applyBps(baseCents, parsePercentToBps(weeklyStop) ?? 0),
    monthly: applyBps(baseCents, parsePercentToBps(monthlyStop) ?? 0),
  };

  const dailyGoalPreview = Math.round(
    (parseMoneyToCents(monthlyGoal) ?? 0) / Math.max(Number(activeDays) || 1, 1),
  );

  // No modo automático o campo continua sendo enviado (readOnly, não disabled),
  // sempre com o valor derivado de meta ÷ dias ativos.
  const dailyGoalValue = goalMode === 'AUTO' ? money(dailyGoalPreview) : dailyGoal;

  return (
    <form action={formAction} className="space-y-5">
      {state && !state.ok ? <Notice tone="danger" title={state.error} /> : null}
      {state?.ok ? <Notice tone="success" title="Configurações salvas com sucesso." /> : null}

      <Card>
        <CardHeader title="Identificação" description="Nome da banca e fuso horário usado para definir o dia corrente." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome da banca" htmlFor="bankrollName" error={details?.bankrollName} required>
            <Input
              id="bankrollName"
              name="bankrollName"
              defaultValue={bankroll.name}
              disabled={readOnly}
              required
            />
          </Field>
          <Field label="Fuso horário" htmlFor="timezone" error={details?.timezone} required>
            <Select id="timezone" name="timezone" defaultValue={bankroll.timezone} disabled={readOnly} required>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Metas"
          description={
            goalsReadOnly && !readOnly
              ? 'Somente o dono da banca altera a banca inicial e as metas. Os valores aparecem aqui apenas para consulta.'
              : 'Valores de referência para acompanhamento. Nenhum deles é tratado como lucro garantido.'
          }
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Banca inicial (R$)"
            htmlFor="initialBankroll"
            error={details?.initialBankroll}
            hint="Ponto de partida do cálculo da banca."
            required
          >
            <Input
              id="initialBankroll"
              name="initialBankroll"
              inputMode="decimal"
              value={initialBankroll}
              onChange={(event) => setInitialBankroll(event.target.value)}
              disabled={goalsLocked}
              required
            />
          </Field>

          <Field label="Meta de lucro mensal (R$)" htmlFor="monthlyGoal" error={details?.monthlyGoal} required>
            <Input
              id="monthlyGoal"
              name="monthlyGoal"
              inputMode="decimal"
              value={monthlyGoal}
              onChange={(event) => setMonthlyGoal(event.target.value)}
              disabled={goalsLocked}
              required
            />
          </Field>

          <Field label="Banca-alvo (R$)" htmlFor="targetBankroll" error={details?.targetBankroll} required>
            <Input
              id="targetBankroll"
              name="targetBankroll"
              inputMode="decimal"
              defaultValue={money(settings.targetBankrollCents)}
              disabled={goalsLocked}
              required
            />
          </Field>

          <Field label="Dias ativos por mês" htmlFor="activeDays" error={details?.activeDays} required>
            <Input
              id="activeDays"
              name="activeDays"
              type="number"
              min={1}
              max={31}
              value={activeDays}
              onChange={(event) => setActiveDays(event.target.value)}
              disabled={goalsLocked}
              required
            />
          </Field>

          <Field label="Meta diária" htmlFor="dailyGoalMode" error={details?.dailyGoalMode} required>
            <Select
              id="dailyGoalMode"
              name="dailyGoalMode"
              value={goalMode}
              onChange={(event) => setGoalMode(event.target.value as 'AUTO' | 'MANUAL')}
              disabled={goalsLocked}
              required
            >
              <option value="AUTO">Calcular automaticamente (meta ÷ dias ativos)</option>
              <option value="MANUAL">Definir manualmente</option>
            </Select>
          </Field>

          <Field
            label="Valor da meta diária (R$)"
            htmlFor="dailyGoal"
            error={details?.dailyGoal}
            hint={
              goalMode === 'AUTO'
                ? `Calculada automaticamente: ${formatMoney(dailyGoalPreview)}`
                : undefined
            }
            required
          >
            <Input
              id="dailyGoal"
              name="dailyGoal"
              inputMode="decimal"
              value={dailyGoalValue}
              onChange={(event) => setDailyGoal(event.target.value)}
              readOnly={goalMode === 'AUTO'}
              disabled={goalsLocked}
              className={goalMode === 'AUTO' ? 'opacity-60' : undefined}
              required
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Controle de risco"
          description="Os limites nunca são ajustados automaticamente pelo sistema."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Base de cálculo"
              htmlFor="riskBase"
              error={details?.riskBase}
              hint={`Base atual: ${formatMoney(baseCents)}`}
              required
            >
              <Select
                id="riskBase"
                name="riskBase"
                value={riskBase}
                onChange={(event) => setRiskBase(event.target.value as typeof riskBase)}
                disabled={readOnly}
                required
              >
                <option value="CURRENT">Banca atual</option>
                <option value="MONTH_START">Banca no início do mês</option>
                <option value="INITIAL">Banca inicial configurada</option>
              </Select>
            </Field>

            <Field
              label="Risco máximo por entrada (%)"
              htmlFor="maxRiskPerEntry"
              error={details?.maxRiskPerEntry}
              hint={`Stake máxima: ${formatMoney(preview.stake)}`}
              required
            >
              <Input
                id="maxRiskPerEntry"
                name="maxRiskPerEntry"
                inputMode="decimal"
                value={riskPercent}
                onChange={(event) => setRiskPercent(event.target.value)}
                disabled={readOnly}
                required
              />
            </Field>

            <Field
              label="Teto absoluto de stake (R$)"
              htmlFor="maxStakeCap"
              error={details?.maxStakeCap}
              hint="Opcional. Deixe vazio para usar somente o percentual."
            >
              <Input
                id="maxStakeCap"
                name="maxStakeCap"
                inputMode="decimal"
                defaultValue={settings.maxStakeCapCents === null ? '' : money(settings.maxStakeCapCents)}
                placeholder="sem teto"
                disabled={readOnly}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Stop diário (%)"
              htmlFor="dailyStop"
              error={details?.dailyStop}
              hint={formatMoney(preview.daily)}
              required
            >
              <Input
                id="dailyStop"
                name="dailyStop"
                inputMode="decimal"
                value={dailyStop}
                onChange={(event) => setDailyStop(event.target.value)}
                disabled={readOnly}
                required
              />
            </Field>
            <Field
              label="Stop semanal (%)"
              htmlFor="weeklyStop"
              error={details?.weeklyStop}
              hint={formatMoney(preview.weekly)}
              required
            >
              <Input
                id="weeklyStop"
                name="weeklyStop"
                inputMode="decimal"
                value={weeklyStop}
                onChange={(event) => setWeeklyStop(event.target.value)}
                disabled={readOnly}
                required
              />
            </Field>
            <Field
              label="Stop mensal (%)"
              htmlFor="monthlyStop"
              error={details?.monthlyStop}
              hint={formatMoney(preview.monthly)}
              required
            >
              <Input
                id="monthlyStop"
                name="monthlyStop"
                inputMode="decimal"
                value={monthlyStop}
                onChange={(event) => setMonthlyStop(event.target.value)}
                disabled={readOnly}
                required
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Entrada acima da stake máxima"
              htmlFor="stakeLimitPolicy"
              error={details?.stakeLimitPolicy}
              required
            >
              <Select
                id="stakeLimitPolicy"
                name="stakeLimitPolicy"
                defaultValue={settings.stakeLimitPolicy}
                disabled={readOnly}
                required
              >
                <option value="BLOCK">Bloquear o registro</option>
                <option value="WARN">Alertar, mas permitir</option>
              </Select>
            </Field>
            <Field
              label="Quando um stop for atingido"
              htmlFor="stopLimitPolicy"
              error={details?.stopLimitPolicy}
              required
            >
              <Select
                id="stopLimitPolicy"
                name="stopLimitPolicy"
                defaultValue={settings.stopLimitPolicy}
                disabled={readOnly}
                required
              >
                <option value="WARN">Alertar, mas permitir</option>
                <option value="BLOCK">Bloquear novos registros no período</option>
              </Select>
            </Field>
          </div>

          <Notice tone="warning" title="Sobre recuperação de prejuízo">
            Mesmo com a política &quot;alertar&quot;, o sistema nunca sugere aumentar stake para recuperar
            perdas e nunca eleva limites sozinho. Aumentar exposição depois de um stop é decisão
            humana, registrada em auditoria.
          </Notice>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Permissões" />
        <CardBody>
          <Checkbox
            name="partnersCanCreateEntries"
            label="Sócios podem registrar entradas"
            description="Quando desligado, apenas o administrador registra entradas. Cada sócio ainda tem uma permissão individual na página Sócios."
            defaultChecked={settings.partnersCanCreateEntries}
            disabled={readOnly}
          />
        </CardBody>
      </Card>

      {!readOnly ? (
        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="lg" loading={pending}>
            Salvar configurações
          </Button>
        </div>
      ) : (
        <Notice tone="info" title="Somente leitura">
          Apenas o administrador pode alterar as configurações da banca.
        </Notice>
      )}
    </form>
  );
}
