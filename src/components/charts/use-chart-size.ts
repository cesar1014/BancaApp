'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Mede a largura real do container para desenhar o SVG em pixels exatos —
 * assim traços e tipografia não são esticados pelo viewBox.
 */
export function useChartWidth(fallback = 720): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const update = () => setWidth(Math.max(element.clientWidth, 280));
    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

/** Escala linear simples entre domínio e faixa de pixels. */
export function makeScale(domainMin: number, domainMax: number, rangeMin: number, rangeMax: number) {
  const span = domainMax - domainMin || 1;
  return (value: number) => rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin);
}

/** Marcações "redondas" para o eixo de valores. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const span = max - min;
  const rawStep = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(Math.abs(rawStep) || 1));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * magnitude);
  const step = candidates.find((c) => c >= rawStep) ?? magnitude * 10;

  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + step * 0.5; value += step) {
    ticks.push(Math.round(value));
  }
  return ticks;
}
