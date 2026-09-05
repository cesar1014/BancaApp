import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl font-semibold tracking-tight text-ink-faint">404</p>
      <h1 className="mt-4 text-lg font-semibold text-ink">Página não encontrada</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
        O endereço acessado não existe neste sistema.
      </p>
      <Link href="/dashboard" className="mt-6">
        <Button variant="primary">Ir para o dashboard</Button>
      </Link>
    </main>
  );
}
