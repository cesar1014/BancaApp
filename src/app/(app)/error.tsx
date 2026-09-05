'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { IconAlert } from '@/components/icons';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app] erro na renderização da página', error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-lg">
      <CardBody className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-negative/30 bg-negative/10 text-xl text-negative">
          <IconAlert />
        </div>
        <h2 className="text-base font-semibold text-ink">Não foi possível carregar esta página</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
          Nenhum dado foi alterado. Tente novamente; se o erro continuar, verifique se o banco de
          dados está acessível e se as migrations foram aplicadas.
        </p>
        {error.digest ? (
          <p className="mt-3 text-2xs text-ink-faint">Código do erro: {error.digest}</p>
        ) : null}
        <Button variant="primary" className="mt-5" onClick={reset}>
          Tentar novamente
        </Button>
      </CardBody>
    </Card>
  );
}
