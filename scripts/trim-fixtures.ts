/**
 * Reduz os fixtures de HTML das fontes de bilhetes.
 *
 *   npx tsx scripts/trim-fixtures.ts
 *
 * Remove o que nenhum parser lê — <script>, <style>, <svg>, <noscript>,
 * comentários e data: URIs — mantendo apenas a marcação que os testes
 * exercitam. Isso deixa o repositório leve e reduz a quantidade de conteúdo
 * de terceiros redistribuída junto com o código.
 *
 * Depois de baixar um fixture novo com curl, rode este script e `npm test`.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'tests', 'fixtures', 'bilhetes');

function trim(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--(?!\[|\]|-->)[\s\S]*?-->/g, '') // preserva os marcadores <!--[--> do Vue
    .replace(/\s(srcset|data-srcset)="[^"]*"/gi, '')
    .replace(/(src|href)="data:[^"]*"/gi, '$1=""')
    .replace(/\n{3,}/g, '\n\n');
}

let before = 0;
let after = 0;
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.html'))) {
  const path = join(DIR, file);
  const original = readFileSync(path, 'utf8');
  const trimmed = trim(original);
  before += statSync(path).size;
  writeFileSync(path, trimmed);
  after += statSync(path).size;
  console.log(`  ${file}: ${Math.round(original.length / 1024)} KB → ${Math.round(trimmed.length / 1024)} KB`);
}
console.log(`\nTotal: ${Math.round(before / 1024)} KB → ${Math.round(after / 1024)} KB`);
