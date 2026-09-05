import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthFrame } from '@/app/login/auth-frame';
import { RecoverPasswordForm } from './recover-form';

export const metadata: Metadata = { title: 'Recuperar senha' };
export const dynamic = 'force-dynamic';

export default function RecoverPasswordPage() {
  return (
    <AuthFrame
      title="Recuperar senha"
      subtitle="Informe seu usuário e a senha padrão do sistema para definir uma nova senha."
      footer={
        <>
          Já trocou sua senha e não lembra dela? Peça ao administrador para restaurar a senha
          padrão da sua conta.
          <br />
          <Link href="/login" className="mt-2 inline-block font-bold text-ink-muted underline-offset-2 hover:text-accent hover:underline">
            Voltar para o login
          </Link>
        </>
      }
    >
      <RecoverPasswordForm />
    </AuthFrame>
  );
}
