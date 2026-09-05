/**
 * Dinheiro é sempre representado por um inteiro de centavos.
 * Nunca usar float para valores monetários — arredondamento binário corrompe
 * somas de longo prazo. Number suporta com segurança até 2^53 centavos
 * (≈ R$ 90 trilhões), muito além de qualquer banca.
 */

export type Cents = number;

/** Garante que o valor é um inteiro de centavos válido. */
export function assertCents(value: unknown, field = 'valor'): Cents {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${field}: valor monetário inválido (esperado inteiro em centavos)`);
  }
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    throw new Error(`${field}: valor monetário fora do intervalo seguro`);
  }
  return value;
}

/** Converte reais (número decimal) para centavos, arredondando meio para cima. */
export function realsToCents(reals: number): Cents {
  if (!Number.isFinite(reals)) throw new Error('Valor inválido');
  return Math.round(reals * 100);
}

export function centsToReals(cents: Cents): number {
  return cents / 100;
}

/**
 * Interpreta texto digitado pelo usuário em pt-BR e devolve centavos.
 * Aceita: "1.234,56"  "1234,56"  "1234.56"  "R$ 50"  "50"  "-120,50"
 * Devolve null quando não há número válido.
 */
export function parseMoneyToCents(input: string): Cents | null {
  if (typeof input !== 'string') return null;
  let raw = input.trim().replace(/\s|R\$| /gi, '');
  if (!raw) return null;

  const negative = raw.startsWith('-');
  if (negative) raw = raw.slice(1);
  if (!/^[\d.,]+$/.test(raw)) return null;

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized: string;

  if (lastComma === -1 && lastDot === -1) {
    normalized = raw;
  } else if (lastComma > lastDot) {
    // vírgula é o separador decimal (padrão pt-BR)
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else {
    // ponto é o separador decimal
    normalized = raw.replace(/,/g, '');
  }

  const parts = normalized.split('.');
  if (parts.length > 2) return null;
  const intPart = parts[0] ?? '';
  const decPart = (parts[1] ?? '').slice(0, 2).padEnd(2, '0');
  if (intPart === '' && (parts[1] ?? '') === '') return null;

  const cents = Number(intPart || '0') * 100 + Number(decPart || '0');
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BRL_NO_SYMBOL = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "R$ 1.234,56" */
export function formatMoney(cents: Cents): string {
  return BRL.format(centsToReals(cents));
}

/** "1.234,56" */
export function formatMoneyPlain(cents: Cents): string {
  return BRL_NO_SYMBOL.format(centsToReals(cents));
}

/**
 * "+R$ 1.234,56" / "−R$ 120,00" — usado onde o sinal comunica resultado.
 *
 * O negativo usa o menos tipográfico (U+2212), não o hífen: ele tem a mesma
 * largura do "+", então colunas de resultado ficam alinhadas em tabular-nums.
 */
export const MINUS = '−';

export function formatMoneySigned(cents: Cents): string {
  const sign = cents > 0 ? '+' : cents < 0 ? MINUS : '';
  return `${sign}${BRL.format(Math.abs(centsToReals(cents)))}`;
}

/** "R$ 12,3 mil" para eixos de gráfico. */
export function formatMoneyCompact(cents: Cents): string {
  const reals = centsToReals(cents);
  const abs = Math.abs(reals);
  const sign = reals < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toFixed(1).replace('.', ',')}k`;
  return `${sign}R$ ${abs.toFixed(0)}`;
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
