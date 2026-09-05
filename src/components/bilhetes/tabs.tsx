'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const TABS = [
  { href: '/bilhetes', label: 'Hoje' },
  { href: '/bilhetes/proximos', label: 'Próximos' },
  { href: '/bilhetes/historico', label: 'Histórico' },
  { href: '/bilhetes/fontes', label: 'Fontes' },
] as const;

export function SlipTabs() {
  const pathname = usePathname();
  return (
    <nav className="no-scrollbar -mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Seções de Bilhetes">
      <ul className="flex min-w-max gap-1 rounded-full border border-line bg-surface p-1">
        {TABS.map((tab) => {
          const active = tab.href === '/bilhetes' ? pathname === '/bilhetes' || pathname.startsWith('/bilhetes/b/') : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-[38px] items-center rounded-full px-4 text-[13px] font-bold transition-colors',
                  active ? 'bg-accent text-ink-invert' : 'text-ink-muted hover:bg-elevated hover:text-ink',
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
