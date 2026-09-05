'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { changePasswordAction } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Notice } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import type { ActionResult } from '@/lib/errors';

export function ChangePasswordForm() {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState<ActionResult<null> | null, FormData>(
    changePasswordAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success('Senha alterada. Entre novamente com a nova senha.');
      const timer = setTimeout(() => router.replace('/login'), 1200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [state, router, toast]);

  const details = state && !state.ok ? state.details : undefined;

  return (
    <form action={formAction} className="max-w-md space-y-4" noValidate>
      {state && !state.ok ? <Notice tone="danger" title={state.error} /> : null}

      <Field label="Senha atual" htmlFor="currentPassword" error={details?.currentPassword} required>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
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

      <Field
        label="Confirmar nova senha"
        htmlFor="confirmPassword"
        error={details?.confirmPassword}
        required
      >
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>

      <p className="text-xs leading-relaxed text-ink-muted">
        Ao trocar a senha, todas as sessões abertas são encerradas e você precisará entrar de novo.
      </p>

      <Button type="submit" variant="primary" loading={pending}>
        Alterar senha
      </Button>
    </form>
  );
}
