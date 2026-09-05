'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from './button';
import { IconChevronLeft, IconChevronRight } from '@/components/icons';

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  paramName = 'pagina',
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (total === 0) return null;

  const go = (target: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramName, String(target));
    router.push(`${pathname}?${params.toString()}`);
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5">
      <p className="text-xs text-ink-muted">
        Exibindo <span className="tnum text-ink">{from}</span>–<span className="tnum text-ink">{to}</span>{' '}
        de <span className="tnum text-ink">{total}</span> registro(s)
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => go(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
        >
          <IconChevronLeft />
        </Button>
        <span className="px-2 text-xs tnum text-ink-muted">
          {page} / {pageCount}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => go(page + 1)}
          disabled={page >= pageCount}
          aria-label="Próxima página"
        >
          <IconChevronRight />
        </Button>
      </div>
    </div>
  );
}
