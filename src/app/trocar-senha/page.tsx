import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { AuthFrame } from '@/app/login/auth-frame';
import { SetupPasswordForm } from './setup-form';

export const metadata: Metadata = { title: 'Definir senha' };
export const dynamic = 'force-dynamic';

/**
 * Primeiro acesso: a pessoa entrou com a senha padrão e precisa definir a
 * sua antes de ver qualquer outra página.
 */
export default async function SetupPasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!user.mustChangePassword) redirect('/dashboard');

  return (
    <AuthFrame
      title={`Olá, ${user.name.split(' ')[0]}`}
      subtitle="Sua conta ainda usa a senha padrão. Defina uma senha só sua para continuar."
    >
      <SetupPasswordForm />
    </AuthFrame>
  );
}
