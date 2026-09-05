'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { collectSlipsAction, toggleSourceAction } from '@/actions/bilhetes';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { IconRefresh } from '@/components/icons';

export function CollectSlipsButton() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await collectSlipsAction();
          if (result.ok) {
            toast.info('Coleta executada.', result.data.messages.join(' · '));
            router.refresh();
          } else {
            toast.error(result.error);
          }
        })
      }
    >
      <IconRefresh /> Coletar agora
    </Button>
  );
}

export function SourceToggle({ slug, active }: { slug: string; active: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={active ? 'secondary' : 'primary'}
      size="sm"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await toggleSourceAction(slug, !active);
          if (result.ok) {
            toast.success(active ? 'Fonte desligada.' : 'Fonte ligada.');
            router.refresh();
          } else {
            toast.error(result.error);
          }
        })
      }
    >
      {active ? 'Desligar' : 'Ligar'}
    </Button>
  );
}
