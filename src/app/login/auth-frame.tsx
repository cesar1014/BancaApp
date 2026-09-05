import type { ReactNode } from 'react';

/** Moldura das telas públicas de acesso (login, recuperação, primeiro acesso). */
export function AuthFrame({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4 py-10">
      {/* Fundo discreto: um leve halo, sem exagero de gradiente */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(60rem 32rem at 50% -10%, rgb(var(--c-accent) / 0.10), transparent 70%)',
        }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* A marca é o mesmo lima do dinheiro, em bloco sólido. */}
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-accent shadow-hero">
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-ink-invert" fill="none" aria-hidden="true">
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
          </div>
          <h1 className="text-[27px] font-extrabold leading-tight tracking-[-0.04em] text-ink">
            {title}
          </h1>
          {subtitle ? <p className="mt-2 text-sm text-ink-muted">{subtitle}</p> : null}
        </div>

        <div className="card p-6">{children}</div>

        {footer ? (
          <p className="mt-7 text-center text-xs leading-relaxed text-ink-faint">{footer}</p>
        ) : null}
      </div>
    </main>
  );
}
