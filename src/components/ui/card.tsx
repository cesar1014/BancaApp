import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({
  children,
  className,
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return <Tag className={cn('card', className)}>{children}</Tag>;
}

/**
 * Cabeçalho sem régua divisória: o cartão respira por espaçamento, não por
 * linhas. A separação fica por conta do fundo e do raio generoso.
 */
export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'card-head flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[15px] font-750 tracking-[-0.02em] text-ink">{title}</h2>
        {description ? (
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-faint">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('card-body p-5', className)}>{children}</div>;
}

/** Rodapé em tom rebaixado — notas, avisos e explicações de metodologia. */
export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <footer
      className={cn(
        'border-t border-line bg-sunken/50 px-5 py-4 text-xs leading-relaxed text-ink-faint',
        className,
      )}
    >
      {children}
    </footer>
  );
}

export function SectionTitle({
  children,
  description,
  actions,
}: {
  children: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-extrabold tracking-[-0.03em] text-ink">{children}</h2>
        {description ? <p className="mt-1 text-xs text-ink-faint">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
