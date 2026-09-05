'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { settleLegAction } from '@/actions/bilhetes';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import type { TipResult } from '@/lib/sports/domain/models';

/** Conferência manual de uma perna que o sistema não decidiu (administrador). */
export function LegResolveButtons({ legId }: { legId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const resolve = (result: TipResult) => {
    startTransition(async () => {
      const response = await settleLegAction(legId, result);
      if (response.ok) {
        toast.success('Perna conferida.');
        router.refresh();
      } else {
        toast.error(response.error);
      }
    });
  };

  const button = (result: TipResult, label: string, className: string) => (
    <button
      type="button"
      disabled={pending}
      onClick={() => resolve(result)}
      className={cn('rounded-sm border px-2 py-0.5 text-badge font-extrabold uppercase transition-colors disabled:opacity-50', className)}
    >
      {label}
    </button>
  );

  return (
    <span className="inline-flex items-center gap-1" aria-label="Conferir manualmente">
      {button('GREEN', 'Green', 'border-accent/35 text-accent hover:bg-accent/12')}
      {button('RED', 'Red', 'border-negative/35 text-negative hover:bg-negative/12')}
      {button('PUSH', 'Push', 'border-line-strong text-ink-muted hover:bg-elevated')}
    </span>
  );
}
