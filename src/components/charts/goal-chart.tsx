'use client';

import { useMemo, useState } from 'react';
import { formatDayMonth, type IsoDate } from '@/lib/datetime';
import { formatMoney, formatMoneyCompact, formatMoneySigned, type Cents } from '@/lib/money';
import { makeScale, niceTicks, useChartWidth } from './use-chart-size';
import { cn } from '@/lib/cn';

export interface GoalChartPoint {
  date: IsoDate;
  goalCents: Cents;
  realizedCents: Cents;
  isFuture: boolean;
}

/**
 * Evolução do mês: meta acumulada × realizado acumulado.
 *
 * A linha da meta é tracejada (é uma referência, não um compromisso) e a área
 * entre as duas linhas ganha a cor do resultado: verde quando o realizado está
 * acima da meta, vermelho quando está abaixo.
 */
export function GoalChart({
  points,
  height = 280,
}: {
  points: readonly GoalChartPoint[];
  height?: number;
}) {
  const [containerRef, width] = useChartWidth();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const padding = { top: 18, right: 16, bottom: 28, left: 62 };
  const innerWidth = Math.max(width - padding.left - padding.right, 10);
  const innerHeight = Math.max(height - padding.top - padding.bottom, 10);

  const visible = useMemo(() => points.filter((p) => !p.isFuture), [points]);

  const { xScale, yScale, ticks, realizedPath, goalPath, areaPath, lastIndex } = useMemo(() => {
    const values = [
      0,
      ...points.map((p) => p.goalCents),
      ...visible.map((p) => p.realizedCents),
    ];
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const pad = Math.max((maxValue - minValue) * 0.12, 1000);

    const x = makeScale(0, Math.max(points.length - 1, 1), padding.left, padding.left + innerWidth);
    const y = makeScale(minValue - pad, maxValue + pad, padding.top + innerHeight, padding.top);

    const goal = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(p.goalCents).toFixed(2)}`).join(' ');

    const realized = visible
      .map((p, i) => {
        const index = points.indexOf(p);
        return `${i === 0 ? 'M' : 'L'}${x(index).toFixed(2)},${y(p.realizedCents).toFixed(2)}`;
      })
      .join(' ');

    /**
     * Área em degradê sob a curva do realizado, fechada na base do gráfico.
     * O volume de cor é o que dá presença ao resultado — a meta continua sendo
     * só uma linha tracejada de referência por cima.
     */
    let area = '';
    if (visible.length > 1) {
      const baseline = padding.top + innerHeight;
      const firstIndex = points.indexOf(visible[0]!);
      const lastVisibleIndex = points.indexOf(visible[visible.length - 1]!);
      const forward = visible
        .map((p, i) => {
          const index = points.indexOf(p);
          return `${i === 0 ? 'M' : 'L'}${x(index).toFixed(2)},${y(p.realizedCents).toFixed(2)}`;
        })
        .join(' ');
      area = `${forward} L${x(lastVisibleIndex).toFixed(2)},${baseline.toFixed(2)} L${x(firstIndex).toFixed(2)},${baseline.toFixed(2)} Z`;
    }

    return {
      xScale: x,
      yScale: y,
      ticks: niceTicks(minValue - pad, maxValue + pad, 4),
      realizedPath: realized,
      goalPath: goal,
      areaPath: area,
      lastIndex: visible.length > 0 ? points.indexOf(visible[visible.length - 1]!) : -1,
    };
  }, [points, visible, innerWidth, innerHeight, padding.left, padding.top]);

  if (points.length === 0) return null;

  const last = lastIndex >= 0 ? points[lastIndex] : undefined;
  const isAhead = last ? last.realizedCents >= last.goalCents : true;
  const hovered = hoverIndex !== null ? points[hoverIndex] : undefined;

  const handleMove = (event: React.MouseEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const relative = event.clientX - bounds.left;
    const step = innerWidth / Math.max(points.length - 1, 1);
    const index = Math.round(relative / step);
    setHoverIndex(Math.min(Math.max(index, 0), points.length - 1));
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <svg width={width} height={height} className="block overflow-visible">
        <defs>
          <linearGradient id="goal-chart-fill-up" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--c-accent))" stopOpacity="0.42" />
            <stop offset="100%" stopColor="rgb(var(--c-accent))" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="goal-chart-fill-down" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--c-negative))" stopOpacity="0.34" />
            <stop offset="100%" stopColor="rgb(var(--c-negative))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grade horizontal */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yScale(tick)}
              y2={yScale(tick)}
              stroke="rgb(var(--c-line))"
              strokeWidth={1}
            />
            <text
              x={padding.left - 10}
              y={yScale(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-[rgb(var(--c-ink-faint))] text-[10px]"
            >
              {formatMoneyCompact(tick)}
            </text>
          </g>
        ))}

        {/* Rótulos do eixo X (a cada 5 dias) */}
        {points.map((point, index) =>
          index % 5 === 0 || index === points.length - 1 ? (
            <text
              key={point.date}
              x={xScale(index)}
              y={height - 8}
              textAnchor="middle"
              className="fill-[rgb(var(--c-ink-faint))] text-[10px]"
            >
              {formatDayMonth(point.date)}
            </text>
          ) : null,
        )}

        {areaPath ? (
          <path d={areaPath} fill={`url(#goal-chart-fill-${isAhead ? 'up' : 'down'})`} />
        ) : null}

        <path
          d={goalPath}
          fill="none"
          stroke="rgb(var(--c-ink-faint))"
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />

        <path
          d={realizedPath}
          fill="none"
          stroke={isAhead ? 'rgb(var(--c-accent))' : 'rgb(var(--c-negative))'}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {last ? (
          <circle
            cx={xScale(lastIndex)}
            cy={yScale(last.realizedCents)}
            r={5}
            fill={isAhead ? 'rgb(var(--c-accent))' : 'rgb(var(--c-negative))'}
            stroke="rgb(var(--c-surface))"
            strokeWidth={2.5}
          />
        ) : null}

        {hovered ? (
          <g>
            <line
              x1={xScale(hoverIndex ?? 0)}
              x2={xScale(hoverIndex ?? 0)}
              y1={padding.top}
              y2={padding.top + innerHeight}
              stroke="rgb(var(--c-line-strong))"
              strokeWidth={1}
            />
            {!hovered.isFuture ? (
              <circle
                cx={xScale(hoverIndex ?? 0)}
                cy={yScale(hovered.realizedCents)}
                r={3.5}
                fill="rgb(var(--c-ink))"
              />
            ) : null}
            <circle
              cx={xScale(hoverIndex ?? 0)}
              cy={yScale(hovered.goalCents)}
              r={3}
              fill="rgb(var(--c-ink-faint))"
            />
          </g>
        ) : null}

        <rect
          x={padding.left}
          y={padding.top}
          width={innerWidth}
          height={innerHeight}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        />
      </svg>

      {hovered ? (
        <div
          className="pointer-events-none absolute z-10 w-44 rounded-md border border-line bg-elevated p-3 shadow-pop"
          style={{
            left: Math.min(Math.max(xScale(hoverIndex ?? 0) - 88, 0), Math.max(width - 176, 0)),
            top: 4,
          }}
        >
          <p className="text-2xs uppercase tracking-wider text-ink-faint">
            {formatDayMonth(hovered.date)}
          </p>
          <dl className="mt-2 space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-muted">Meta</dt>
              <dd className="tnum text-ink">{formatMoney(hovered.goalCents)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-muted">Realizado</dt>
              <dd className="tnum text-ink">
                {hovered.isFuture ? '—' : formatMoney(hovered.realizedCents)}
              </dd>
            </div>
            {!hovered.isFuture ? (
              <div className="flex items-center justify-between gap-3 border-t border-line pt-1.5">
                <dt className="text-ink-muted">Diferença</dt>
                <dd
                  className={cn(
                    'tnum font-medium',
                    hovered.realizedCents - hovered.goalCents >= 0 ? 'text-positive' : 'text-negative',
                  )}
                >
                  {formatMoneySigned(hovered.realizedCents - hovered.goalCents)}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-4 pl-1 text-xs text-ink-muted">
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-1 w-6 rounded-full"
            style={{ background: isAhead ? 'rgb(var(--c-accent))' : 'rgb(var(--c-negative))' }}
          />
          Realizado acumulado
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-0 w-6 border-t-2 border-dashed"
            style={{ borderColor: 'rgb(var(--c-ink-faint))' }}
          />
          Meta acumulada
        </span>
      </div>
    </div>
  );
}
