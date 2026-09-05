'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { IconClose, IconLogout, IconMore } from '@/components/icons';
import { NAV_GROUPS, NAV_ITEMS, PRIMARY_TABS, TAB_LABEL } from './nav-items';
import { logoutAction } from '@/actions/auth';
import type { SessionUser } from '@/lib/domain/types';

/**
 * Casca do app, desenhada primeiro para o celular.
 *
 * No celular a navegação é uma barra inferior com os quatro destinos do dia a
 * dia; o menu completo abre num bottom sheet. No desktop os mesmos itens viram
 * uma sidebar de 264px, e o conteúdo é a mesma grade de cartões.
 */
export function AppShell({
  user,
  bankrollName,
  children,
}: {
  user: SessionUser;
  bankrollName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // Fecha o sheet ao navegar e trava o scroll do fundo enquanto ele está aberto.
  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!sheetOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSheetOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [sheetOpen]);

  const tabs = PRIMARY_TABS.map((href) => NAV_ITEMS.find((item) => item.href === href)).filter(
    (item): item is (typeof NAV_ITEMS)[number] => Boolean(item),
  );

  const groupedNav = (
    <div className="space-y-7">
      {NAV_GROUPS.map((group) => (
        <div key={group}>
          <p className="lbl px-3 pb-2.5">{group}</p>
          <ul className="space-y-1">
            {NAV_ITEMS.filter((item) => item.group === group).map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'group flex min-h-[46px] items-center gap-3 rounded-md px-3 text-[14.5px] transition-colors',
                      active
                        ? 'bg-accent font-extrabold text-ink-invert'
                        : 'font-semibold text-ink-muted hover:bg-elevated hover:text-ink',
                    )}
                  >
                    <span
                      className={cn(
                        'text-[19px]',
                        active ? 'text-ink-invert' : 'text-ink-faint group-hover:text-ink-muted',
                      )}
                    >
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );

  const identity = (
    <div className="flex items-center gap-3 rounded-md border border-line bg-elevated/50 p-2.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-extrabold text-ink-invert">
        {initials(user.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink">{user.name}</p>
        <p className="truncate text-2xs font-extrabold uppercase text-ink-faint">
          {user.username ? `@${user.username}` : user.email}
        </p>
      </div>
      <form action={logoutAction}>
        <Button type="submit" variant="ghost" size="icon" title="Sair" aria-label="Sair da conta">
          <IconLogout />
        </Button>
      </form>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      {/* ---------------------------------------------------------------- */}
      {/* Desktop: sidebar                                                  */}
      {/* ---------------------------------------------------------------- */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-[72px] items-center gap-3 px-5">
          <BrandMark />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-extrabold tracking-[-0.02em] text-ink">
              {bankrollName}
            </span>
            <span className="lbl block">Banca esportiva</span>
          </span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">{groupedNav}</nav>
        <div className="p-3">{identity}</div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* -------------------------------------------------------------- */}
        {/* Celular: header compacto translúcido                            */}
        {/* -------------------------------------------------------------- */}
        <header className="bar-blur sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 lg:hidden">
          <BrandMark />
          <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold tracking-[-0.02em] text-ink">
            {bankrollName}
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-extrabold text-ink-invert">
            {initials(user.name)}
          </span>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 pb-tabbar sm:px-6 lg:px-8 lg:py-8 lg:pb-8">
          {children}
        </main>

        {/* -------------------------------------------------------------- */}
        {/* Celular: barra inferior                                         */}
        {/* -------------------------------------------------------------- */}
        <nav
          className="bar-blur fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 gap-0.5 border-t px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] lg:hidden"
          aria-label="Navegação principal"
        >
          {tabs.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5 transition-colors',
                  active ? 'bg-accent text-ink-invert' : 'text-ink-faint hover:text-ink-muted',
                )}
              >
                <span className="text-[21px]">{item.icon}</span>
                <span className="text-[10px] font-bold">{TAB_LABEL[item.href] ?? item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-expanded={sheetOpen}
            aria-haspopup="dialog"
            className={cn(
              'flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5 transition-colors',
              sheetOpen ? 'bg-elevated text-ink' : 'text-ink-faint hover:text-ink-muted',
            )}
          >
            <span className="text-[21px]">
              <IconMore />
            </span>
            <span className="text-[10px] font-bold">Mais</span>
          </button>
        </nav>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Celular: bottom sheet com o menu completo                         */}
      {/* ---------------------------------------------------------------- */}
      {sheetOpen ? (
        <div className="fixed inset-0 z-40 flex flex-col justify-end lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-black/70"
            onClick={() => setSheetOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="bar-blur relative z-10 max-h-[86dvh] animate-sheet-up overflow-y-auto rounded-t-2xl border-t px-4 pt-2 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-pop"
          >
            <span
              className="mx-auto mb-4 block h-1 w-10 rounded-full bg-line-strong"
              aria-hidden="true"
            />
            <div className="mb-5 flex items-center justify-between gap-3">
              <span className="text-lg font-extrabold tracking-[-0.03em] text-ink">Menu</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSheetOpen(false)}
                aria-label="Fechar menu"
              >
                <IconClose />
              </Button>
            </div>
            {groupedNav}
            <div className="mt-6">{identity}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Marca: o mesmo lima do dinheiro, em bloco sólido. */
function BrandMark() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent">
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-ink-invert" fill="none" aria-hidden="true">
        <path
          d="M4 17.5 9 11l4 4 7-8.5"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15.5 6.5H20V11"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}
