'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { refreshTipsAction } from '@/actions/tips';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { IconRefresh } from '@/components/icons';
import type { JobName } from '@/lib/services/sports/engine';

export function RefreshTipsButton({ job = 'all', label = 'Atualizar agora', size = 'sm' }: { job?: JobName | 'all'; label?: string; size?: 'sm' | 'md' }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const run = () => {
    startTransition(async () => {
      const result = await refreshTipsAction(job);
      if (result.ok) {
        toast.info('Atualização executada.', result.data.messages.join(' · '));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Button variant="secondary" size={size} onClick={run} loading={pending}>
      <IconRefresh /> {label}
    </Button>
  );
}
