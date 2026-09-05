'use client';

import { useMemo, useState } from 'react';
import { formatMoney, formatMoneyCompact, type Cents } from '@/lib/money';
import { makeScale, niceTicks, useChartWidth } from './use-chart-size';

export interface BarPoint {
  label: string;
  valueCents: Cents;
  /** Valor de referência exibido como marca fina sobre a barra (ex.: meta). */
  referenceCents?: Cents;
  caption?: string;
}

/** Comparativo entre períodos: lucro por mês, com a meta como marca. */
export function BarChart({ points, height = 260 }: { points: readonly BarPoint[]; height?: number }) {
  const [containerRef, width] = useChartWidth();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const padding = { top: 16, right: 12, bottom: 34, left: 62 };
  const innerWidth = Math.max(width - padding.left - padding.right, 10);
  const innerHeight = Math.max(height - padding.top - padding.bottom, 10);

  const { yScale, ticks, bandWidth, barWidth } = useMemo(() => {
    const values = points.flatMap((p) => [p.valueCents, p.referenceCents ?? 0, 0]);
    const minValue = Math.min(...values, 0);
    const maxValue = Math.max(...values, 0);
    const pad = Math.max((maxValue - minValue) * 0.14, 1000);

    const band = innerWidth / Math.max(points.length, 1);
    return {
      yScale: makeScale(minValue - pad, maxValue + pad, padding.top + innerHeight, padding.top),
      ticks: niceTicks(minValue - pad, maxValue + pad, 4),
      bandWidth: band,
      barWidth: Math.min(band * 0.52, 46),
    };
  }, [points, innerWidth, innerHeight, padding.top]);

  if (points.length === 0) return null;

  const zeroY = yScale(0);
  const hovered = hoverIndex !== null ? points[hoverIndex] : undefined;

  return (
    <div ref={containerRef} className="relative w-full">
      <svg width={width} height={height} className="block overflow-visible">
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yScale(tick)}
              y2={yScale(tick)}
              stroke={tick === 0 ? 'rgb(var(--c-line-strong))' : 'rgb(var(--c-line))'}
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

        {points.map((point, index) => {
          const center = padding.left + bandWidth * index + bandWidth / 2;
          const valueY = yScale(point.valueCents);
          const top = Math.min(valueY, zeroY);
          const barHeight = Math.max(Math.abs(valueY - zeroY), 2);
          const positive = point.valueCents >= 0;
          const active = hoverIndex === index;

          return (
            <g
              key={point.label}
              onMouseEnter={() => setHoverIndex(index)}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <rect
                x={padding.left + bandWidth * index}
                y={padding.top}
                width={bandWidth}
                height={innerHeight}
                fill={active ? 'rgb(var(--c-elevated))' : 'transparent'}
                opacity={0.5}
              />
              <rect
                x={center - barWidth / 2}
                y={top}
                width={barWidth}
                height={barHeight}
                rx={4}
                fill={positive ? 'rgb(var(--c-positive))' : 'rgb(var(--c-negative))'}
                opacity={active ? 1 : 0.85}
              />
              {point.referenceCents !== undefined ? (
                <line
                  x1={center - barWidth / 2 - 4}
                  x2={center + barWidth / 2 + 4}
                  y1={yScale(point.referenceCents)}
                  y2={yScale(point.referenceCents)}
                  stroke="rgb(var(--c-ink-faint))"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
              ) : null}
              <text
                x={center}
                y={height - 12}
                textAnchor="middle"
                className="fill-[rgb(var(--c-ink-faint))] text-[10px]"
              >
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>

      {hovered ? (
        <div className="pointer-events-none absolute left-1/2 top-0 w-48 -translate-x-1/2 rounded-lg border border-line bg-elevated p-3 shadow-pop">
          <p className="text-2xs uppercase tracking-wider text-ink-faint">{hovered.label}</p>
          <p className="mt-1.5 text-sm font-semibold tnum text-ink">
            {formatMoney(hovered.valueCents)}
          </p>
          {hovered.referenceCents !== undefined ? (
            <p className="mt-0.5 text-xs text-ink-muted">
              Meta: <span className="tnum">{formatMoney(hovered.referenceCents)}</span>
            </p>
          ) : null}
          {hovered.caption ? <p className="mt-1 text-xs text-ink-muted">{hovered.caption}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
