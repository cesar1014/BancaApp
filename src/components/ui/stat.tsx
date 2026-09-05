import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatBps, type Bps } from '@/lib/numbers';

export type StatTone = 'default' | 'positive' | 'negative' | 'accent' | 'warning';

const VALUE_TONE: Record<StatTone, string> = {
  default: 'text-ink',
  positive: 'text-positive',
  negative: 'text-negative',
  accent: 'text-accent',
  warning: 'text-warning',
};

/**
 * Cartão de métrica. A escala é de contraste violento: rótulo minúsculo em
 * caixa-alta contra um número grande e pesado. Poucos degraus no meio.
 */
export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  icon,
  className,
  size = 'md',
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  icon?: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <div className={cn('card p-5 transition-colors hover:border-line-strong', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="lbl">{label}</p>
        {icon ? <span className="shrink-0 text-base text-ink-faint">{icon}</span> : null}
      </div>
      <p
        className={cn(
          'mt-3 tnum',
          size === 'sm' && 'text-num-md font-bold',
          size === 'md' && 'text-num-lg font-750',
          size === 'lg' && 'text-num-xl font-extrabold',
          VALUE_TONE[tone],
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs leading-relaxed text-ink-muted">{hint}</p> : null}
    </div>
  );
}

/** Item compacto de métrica, para grades densas dentro de um card. */
export function MiniStat({
  label,
  value,
  tone = 'default',
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: StatTone;
}) {
  return (
    <div className="rounded-md border border-line bg-elevated/55 px-3.5 py-3">
      <p className="lbl">{label}</p>
      <p className={cn('mt-1.5 text-num-md font-bold tnum', VALUE_TONE[tone])}>{value}</p>
    </div>
  );
}

/**
 * Bloco herói — a resposta a "como estamos?" antes de qualquer rolagem.
 *
 * No lucro, é um bloco de cor sólida com tinta escura em cima: hierarquia
 * invertida, o dinheiro vira a identidade da tela. No prejuízo, o bloco recua
 * para superfície neutra com o número em vermelho — perder não se comemora com
 * a cor da marca.
 */
export function HeroStat({
  label,
  value,
  chip,
  ring,
  meta,
  isPositive,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  chip?: ReactNode;
  ring?: ReactNode;
  meta?: readonly { label: ReactNode; value: ReactNode }[];
  isPositive: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(
        isPositive ? 'hero-block' : 'card p-5 sm:p-6',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={isPositive ? 'lbl-on' : 'lbl'}>{label}</p>
          <p
            className={cn(
              'mt-4 font-extrabold tnum text-hero lg:text-hero-lg',
              isPositive ? 'text-ink-invert' : 'text-negative',
            )}
          >
            {value}
          </p>
        </div>
        {ring ? <div className="shrink-0">{ring}</div> : null}
      </div>

      {chip ? <div className="mt-4">{chip}</div> : null}

      {meta && meta.length > 0 ? (
        <dl
          className={cn(
            'mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t pt-4',
            isPositive ? 'border-ink-invert/20' : 'border-line',
          )}
        >
          {meta.map((item, index) => (
            <div key={index} className="min-w-0">
              <dt className={isPositive ? 'lbl-on' : 'lbl'}>{item.label}</dt>
              <dd
                className={cn(
                  'mt-1 text-[15px] font-extrabold tracking-[-0.02em] tnum',
                  isPositive ? 'text-ink-invert' : 'text-ink',
                )}
              >
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

/** Pílula de apoio dentro do bloco herói. */
export function HeroChip({
  children,
  isPositive,
}: {
  children: ReactNode;
  isPositive: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold',
        isPositive
          ? 'bg-ink-invert/12 text-ink-invert'
          : 'border border-line bg-elevated text-ink-muted',
      )}
    >
      {children}
    </span>
  );
}

/**
 * Anel de progresso da meta. Sobre o bloco lima ele é desenhado em tinta
 * escura; sobre superfície neutra, em lima.
 */
export function GoalRing({
  valueBps,
  caption,
  on = 'surface',
  size = 116,
}: {
  valueBps: Bps;
  caption?: ReactNode;
  on?: 'accent' | 'surface';
  size?: number;
}) {
  const clamped = Math.min(Math.max(valueBps, 0), 10_000);
  const stroke = 11;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 10_000);

  const trackColor = on === 'accent' ? 'rgb(var(--c-ink-invert) / 0.18)' : 'rgb(var(--c-elevated))';
  const fillColor = on === 'accent' ? 'rgb(var(--c-ink-invert))' : 'rgb(var(--c-accent))';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block -rotate-90"
        role="img"
        aria-label={`Progresso da meta: ${formatBps(clamped, 1)}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={fillColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-1000 ease-placar"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className={cn(
            'text-num-md font-extrabold tnum',
            on === 'accent' ? 'text-ink-invert' : 'text-ink',
          )}
        >
          {formatBps(clamped, 0)}
        </span>
        {caption ? (
          <span
            className={cn(
              'mt-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.14em]',
              on === 'accent' ? 'text-ink-invert/60' : 'text-ink-faint',
            )}
          >
            {caption}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function ProgressBar({
  valueBps,
  tone = 'accent',
  className,
  showMarker = false,
  markerBps,
  height = 'md',
}: {
  valueBps: Bps;
  tone?: 'accent' | 'positive' | 'negative' | 'warning';
  className?: string;
  showMarker?: boolean;
  markerBps?: Bps;
  height?: 'sm' | 'md' | 'lg';
}) {
  const clamped = Math.min(Math.max(valueBps, 0), 10_000);
  const fills = {
    accent: 'bg-accent',
    positive: 'bg-positive',
    negative: 'bg-negative',
    warning: 'bg-warning',
  } as const;
  const heights = { sm: 'h-2', md: 'h-3', lg: 'h-4' } as const;

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-sunken ring-1 ring-inset ring-line',
        heights[height],
        className,
      )}
      role="progressbar"
      aria-valuenow={Math.round(clamped / 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Progresso: ${formatBps(clamped, 0)}`}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-700 ease-placar', fills[tone])}
        style={{ width: `${clamped / 100}%` }}
      />
      {showMarker && markerBps !== undefined ? (
        <span
          className="absolute top-0 h-full w-px bg-ink/40"
          style={{ left: `${Math.min(Math.max(markerBps, 0), 10_000) / 100}%` }}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

/**
 * Medidor de segurança. O controle de risco é um painel de instrumentos com o
 * mesmo peso visual do lucro — nunca um rodapé.
 */
export function Gauge({
  name,
  valueBps,
  readout,
  footLeft,
  footRight,
  tone = 'positive',
}: {
  name: ReactNode;
  valueBps: Bps;
  readout?: ReactNode;
  footLeft?: ReactNode;
  footRight?: ReactNode;
  tone?: 'accent' | 'positive' | 'negative' | 'warning';
}) {
  return (
    <div className="gauge">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-bold text-ink">{name}</span>
        {readout ? <span className="text-xs tnum text-ink-muted">{readout}</span> : null}
      </div>
      <ProgressBar valueBps={valueBps} tone={tone} height="sm" showMarker markerBps={7000} />
      {footLeft || footRight ? (
        <div className="mt-2 flex justify-between gap-2 text-[11px] tnum text-ink-faint">
          <span>{footLeft}</span>
          <span>{footRight}</span>
        </div>
      ) : null}
    </div>
  );
}
