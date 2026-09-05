import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { loadBankrollContext, loadBankrollState } from '@/lib/services/context';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { SettingsForm } from '@/components/settings/settings-form';
import { ChangePasswordForm } from '@/components/settings/change-password-form';
import { ProviderStatusCard } from '@/components/tips/provider-status-card';
import { loadProviderStatus } from '@/lib/services/sports/tips.service';
import { formatDateTimeBR, monthOfDate } from '@/lib/datetime';

export const metadata: Metadata = { title: 'Configurações' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireUser();
  const context = await loadBankrollContext(user);
  const current = monthOfDate(context.today);
  const state = await loadBankrollState(
    context.bankroll.id,
    context.settings,
    current.year,
    current.month,
  );

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Todos os números do sistema vêm daqui — nada fica fixo no código. Alterações são registradas na auditoria."
      />

      <SettingsForm
        bankroll={context.bankroll}
        settings={context.settings}
        currentBankrollCents={state.currentBankrollCents}
        monthStartBankrollCents={state.monthStartBankrollCents}
        readOnly={!context.permissions.canManageSettings}
        goalsReadOnly={!context.permissions.canManageGoals}
      />

      {context.permissions.canManageTips ? (
        <div className="mt-5">
          <ProviderStatusCard status={await loadProviderStatus()} timezone={context.bankroll.timezone} />
        </div>
      ) : null}

      <Card className="mt-5">
        <CardHeader
          title="Minha senha"
          description={`Última alteração das configurações: ${formatDateTimeBR(context.settings.updatedAt, context.bankroll.timezone)}.`}
        />
        <CardBody>
          <ChangePasswordForm />
        </CardBody>
      </Card>
    </>
  );
}
