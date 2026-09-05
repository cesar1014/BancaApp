import { requireUser } from '@/lib/auth/session';
import { getBankroll } from '@/lib/repos/bankroll';
import { AppShell } from '@/components/layout/app-shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const bankroll = await getBankroll(user.bankrollId);

  return (
    <AppShell user={user} bankrollName={bankroll.name}>
      {children}
    </AppShell>
  );
}
