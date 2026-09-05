/**
 * Verifica se todo import aponta para um arquivo que existe com EXATAMENTE
 * o mesmo uso de maiúsculas e minúsculas.
 *
 *   npx tsx scripts/check-imports.ts
 *
 * O Windows trata "Button" e "button" como o mesmo arquivo; o Linux da Vercel
 * não. Sem esta checagem, um import com a caixa errada passa no build local e
 * quebra o deploy.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css'];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** O caminho existe no disco com esta caixa exata? */
function existsExact(path: string): boolean {
  const rel = relative(ROOT, path);
  if (rel.startsWith('..')) return true; // fora do projeto: não checamos
  let current = ROOT;
  for (const part of rel.split(sep)) {
    if (part === '') continue;
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return false;
    }
    if (!entries.includes(part)) return false;
    current = join(current, part);
  }
  return true;
}

function resolveImport(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null; // pacote do node_modules

  const candidates = [base, ...EXTENSIONS.map((e) => base + e), ...EXTENSIONS.map((e) => join(base, 'index' + e))];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile() && existsExact(candidate)) return null; // ok
    } catch {
      /* tenta o próximo */
    }
  }
  // Existe ignorando a caixa? Então é erro de caixa.
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* segue */
    }
  }
  return 'AUSENTE';
}

const problems: string[] = [];
for (const file of walk(SRC)) {
  const code = readFileSync(file, 'utf8');
  const specs = [...code.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);
  for (const spec of specs) {
    const problem = resolveImport(file, spec);
    if (problem === 'AUSENTE') problems.push(`${relative(ROOT, file)} → "${spec}" não existe`);
    else if (problem) problems.push(`${relative(ROOT, file)} → "${spec}" só existe como ${relative(ROOT, problem)} (caixa diferente)`);
  }
}

if (problems.length === 0) {
  console.log('Todos os imports batem com o disco, inclusive maiúsculas e minúsculas.');
} else {
  console.log(`${problems.length} problema(s):\n`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
