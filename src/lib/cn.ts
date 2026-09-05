type ClassValue = string | number | null | undefined | false | ClassValue[] | Record<string, boolean>;

/**
 * Concatena classes condicionalmente. Suficiente para o projeto e sem
 * dependência externa — não faz merge de conflitos do Tailwind, então a ordem
 * das classes é a ordem final.
 */
export function cn(...values: ClassValue[]): string {
  const out: string[] = [];

  for (const value of values) {
    if (!value) continue;
    if (typeof value === 'string' || typeof value === 'number') {
      out.push(String(value));
    } else if (Array.isArray(value)) {
      const nested = cn(...value);
      if (nested) out.push(nested);
    } else {
      for (const [key, enabled] of Object.entries(value)) {
        if (enabled) out.push(key);
      }
    }
  }

  return out.join(' ');
}
