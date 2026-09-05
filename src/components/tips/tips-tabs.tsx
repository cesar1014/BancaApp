'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const TABS = [
  { href: '/dicas', label: 'Destaques' },
  { href: '/dicas/hoje', label: 'Hoje' },
  { href: '/dicas/proximos', label: 'Próximos' },
  { href: '/dicas/ao-vivo', label: 'Ao vivo' },
  { href: '/dicas/historico', label: 'Histórico' },
] as const;

export function TipsTabs({ liveCount }: { liveCount: number }) {
  const pathname = usePathname();
  return (
    <nav className="no-scrollbar -mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Seções da Central de Dicas">
      <ul className="flex min-w-max gap-1 rounded-full border border-line bg-surface p-1">
        {TABS.map((tab) => {
          const active = tab.href === '/dicas' ? pathname === '/dicas' || pathname.startsWith('/dicas/partida') : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 text-[13px] font-bold transition-colors',
                  active ? 'bg-accent text-ink-invert' : 'text-ink-muted hover:bg-elevated hover:text-ink',
                )}
              >
                {tab.label}
                {tab.href === '/dicas/ao-vivo' && liveCount > 0 ? (
                  <span className={cn('rounded-full px-1.5 text-[10px] tnum', active ? 'bg-ink-invert/15' : 'bg-accent/15 text-accent')}>{liveCount}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
