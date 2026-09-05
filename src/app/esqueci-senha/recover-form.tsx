'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { recoverPasswordAction } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Notice } from '@/components/ui/feedback';
import type { ActionResult } from '@/lib/errors';

export function RecoverPasswordForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    recoverPasswordAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      const timer = setTimeout(() => router.replace('/login'), 1500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [state, router]);

  const details = state && !state.ok ? state.details : undefined;

  if (state?.ok) {
    return (
      <Notice tone="success" title="Senha definida com sucesso.">
        Você já pode entrar com a nova senha. Redirecionando para o login…
      </Notice>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state && !state.ok ? <Notice tone="danger" title={state.error} /> : null}

      <Field label="Usuário" htmlFor="login" error={details?.login} required>
        <Input
          id="login"
          name="login"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="seu nick"
          required
          autoFocus
        />
      </Field>

      <Field
        label="Senha padrão"
        htmlFor="currentPassword"
        error={details?.currentPassword}
        hint="A senha inicial fornecida pelo administrador."
        required
      >
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="off" required />
      </Field>

      <Field label="Nova senha" htmlFor="newPassword" error={details?.newPassword} required>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>

      <Field label="Confirmar nova senha" htmlFor="confirmPassword" error={details?.confirmPassword} required>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>

      <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>
        Definir nova senha
      </Button>
    </form>
  );
}
