'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { completePasswordSetupAction, logoutAction } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Notice } from '@/components/ui/feedback';
import type { ActionResult } from '@/lib/errors';

export function SetupPasswordForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    completePasswordSetupAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      router.replace('/dashboard');
      router.refresh();
    }
  }, [state, router]);

  const details = state && !state.ok ? state.details : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state && !state.ok ? <Notice tone="danger" title={state.error} /> : null}

      <Field label="Senha padrão" htmlFor="currentPassword" error={details?.currentPassword} required>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
        />
      </Field>

      <Field
        label="Nova senha"
        htmlFor="newPassword"
        error={details?.newPassword}
        hint="Pelo menos 8 caracteres."
        required
      >
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
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
        Salvar e continuar
      </Button>

    </form>
  );
}

/**
 * Sair fica fora do formulário de senha: dois <form> irmãos, nunca aninhados.
 * O logout precisa ser um submit de formulário — uma Server Action que
 * termina em redirect() não navega quando é chamada de um onClick.
 */
export function SetupLogout() {
  return (
    <form action={logoutAction} className="mt-4 text-center">
      <Button type="submit" variant="ghost" size="sm">
        Sair
      </Button>
    </form>
  );
}
