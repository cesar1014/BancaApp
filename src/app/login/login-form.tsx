'use client';

import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loginAction, type LoginResult } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Notice } from '@/components/ui/feedback';
import type { ActionResult } from '@/lib/errors';

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult<LoginResult> | null, FormData>(
    loginAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      router.replace(state.data.mustChangePassword ? '/trocar-senha' : redirectTo);
      router.refresh();
    }
  }, [state, router, redirectTo]);

  const details = state && !state.ok ? state.details : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state && !state.ok ? <Notice tone="danger" title={state.error} /> : null}

      <Field label="Usuário" htmlFor="login" error={details?.login} required>
        <Input
          id="login"
          name="login"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="seu nick"
          required
          autoFocus
          invalid={Boolean(details?.login)}
        />
      </Field>

      <Field label="Senha" htmlFor="password" error={details?.password} required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          invalid={Boolean(details?.password)}
        />
      </Field>

      <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>
        {pending ? 'Entrando...' : 'Entrar'}
      </Button>

      <p className="text-center text-xs text-ink-faint">
        <Link href="/esqueci-senha" className="font-bold text-ink-muted underline-offset-2 hover:text-accent hover:underline">
          Esqueci minha senha
        </Link>
      </p>
    </form>
  );
}
