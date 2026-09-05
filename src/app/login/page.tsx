import type { Metadata } from 'next';
import { LoginForm } from './login-form';
import { AuthFrame } from './auth-frame';

export const metadata: Metadata = { title: 'Entrar' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = params.redirect?.startsWith('/') ? params.redirect : '/dashboard';

  return (
    <AuthFrame
      title="Banca compartilhada"
      subtitle="Entre com seu usuário para acompanhar a banca."
      footer={
        <>
          As metas registradas aqui são referências de acompanhamento.
          <br />
          Nenhum resultado é garantido.
        </>
      }
    >
      <LoginForm redirectTo={redirectTo} />
    </AuthFrame>
  );
}
