'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Recarrega os dados do servidor em intervalo fixo enquanto a aba está
 * visível. O servidor decide se realmente consulta um provedor (cooldown),
 * então o intervalo do cliente nunca gera quota extra.
 */
export function LiveAutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const onVisibility = () => setPaused(document.visibilityState !== 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (paused) return undefined;
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [paused, intervalMs, router]);

  return (
    <span className="text-2xs font-extrabold uppercase text-ink-faint" aria-live="polite">
      {paused ? 'atualização pausada' : `atualiza a cada ${Math.round(intervalMs / 1000)} s`}
    </span>
  );
}
