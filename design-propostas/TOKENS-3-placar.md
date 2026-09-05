# TOKENS — Proposta 3 · "Placar"

Mobile-first · KPI heroico · energia controlada.
Carvão levemente quente + **um** acento lima usado em *superfície*, não só em texto.

---

## 1. Paleta (`src/app/globals.css`)

```css
:root {
  /* superfícies — carvão quente, não preto-azulado */
  --c-canvas:      17 16 14;   /* #11100E  fundo do app        */
  --c-surface:     26 24 21;   /* #1A1815  cartão               */
  --c-elevated:    36 33 29;   /* #24211D  input, chip, gauge   */
  --c-sunken:      12 11 10;   /* #0C0B0A  trilho, rodapé       */
  --c-line:        48 44 39;   /* #302C27  borda padrão         */
  --c-line-strong: 74 68 60;   /* #4A443C  borda em destaque    */

  /* tinta */
  --c-ink:        246 244 240; /* #F6F4F0  texto principal      */
  --c-ink-muted:  173 166 155; /* #ADA69B  texto secundário     */
  --c-ink-faint:  138 131 121; /* #8A8379  rótulos (AA: 5,0:1)  */
  --c-ink-invert: 16 15 13;    /* #100F0D  texto sobre o acento */

  /* um acento, um negativo, um alerta — nada de arco-íris */
  --c-accent:      198 249 76; /* #C6F94C  lima elétrico = marca E lucro */
  --c-accent-deep: 141 199 33; /* #8DC721  hover / degradê               */
  --c-negative:    255 92 82;  /* #FF5C52  prejuízo, stop atingido       */
  --c-warning:     255 176 46; /* #FFB02E  exposição, cashout, atenção   */

  color-scheme: dark;
}
```

**Regra de uso da cor.** O acento não é só texto: o cartão-herói do lucro é um
**bloco sólido lima com tinta escura em cima** (hierarquia invertida). Lucro e
acento são a MESMA cor — o dinheiro é a identidade. Vermelho é igualmente
saturado e assumido. Âmbar só para exposição/atenção. Nada mais.

Contrastes verificados sobre `--c-canvas`: ink 18,7:1 · ink-muted 8,6:1 ·
ink-faint 5,0:1 · accent 15,5:1 · negative 6,3:1 · warning 10,4:1.
Tinta invertida sobre o bloco lima: 15,5:1.

---

## 2. Tipografia — contraste violento, poucos degraus

Família: system stack (zero rede).

```css
--font-sans: ui-sans-serif, system-ui, "Segoe UI Variable", "Segoe UI",
             Roboto, "Helvetica Neue", Arial, sans-serif;
--font-mono: ui-monospace, "Cascadia Mono", "Segoe UI Mono", Consolas, monospace;
```

| token | tamanho | peso | tracking | uso |
| --- | --- | --- | --- | --- |
| `hero-num` | **46 px mobile / 70 px desktop** (40 px < 390 px) | 800 | −0,045em | lucro do mês — a maior coisa da tela |
| `num-xl` | 32 px | 800 | −0,035em | banca atual, ROI, stake máxima |
| `num-lg` | 23 px | 750 | −0,03em | totais de cartão |
| `num-md` | 16 px | 700 | −0,015em | valores em lista |
| `title` | 27 px mobile / 31 px desktop | 800 | −0,04em | título de página |
| `card-ttl` | 15 px | 750 | −0,02em | título de cartão |
| `body` | 15 px / 13,5 px | 400–600 | 0 | texto corrido, tabela |
| `t-xs` | 12 px | 400 | 0 | apoio |
| `lbl` | **10,5 px** | 800 | **+0,16em**, CAIXA-ALTA | todo rótulo |
| `badge` | 10 px | 800 | +0,1em, CAIXA-ALTA | GREEN / RED / VOID / CASHOUT |

Toda coluna de dinheiro usa `font-variant-numeric: tabular-nums` (`.tnum`).
Sinal explícito: `+R$ 1.842,50` / `−R$ 520,00` (menos tipográfico U+2212).

---

## 3. Raios, sombras, espaçamento

```css
--r-xs: 8px;  --r-sm: 12px; --r-md: 16px;
--r-lg: 20px; /* cartão */   --r-xl: 24px; /* herói, modal, sheet */
--r-full: 999px; /* botão, chip, badge de nav, trilho */

--sh-1:    0 1px 0 rgb(255 255 255 / .035) inset, 0 2px 6px -2px rgb(0 0 0 / .55);
--sh-2:    0 1px 0 rgb(255 255 255 / .05)  inset, 0 14px 36px -18px rgb(0 0 0 / .85);
--sh-hero: 0 18px 44px -20px rgb(var(--c-accent) / .45),
           0 2px 0 rgb(255 255 255 / .18) inset;
--sh-pop:  0 32px 80px -24px rgb(0 0 0 / .85), 0 0 0 1px rgb(255 255 255 / .06);

/* escala de 4 */
--s1:4px --s2:8px --s3:12px --s4:16px --s5:20px --s6:24px --s8:32px --s10:40px;
```

Barras fixas (topbar, tabbar, sheet) usam translucidez real:
`background: rgb(var(--c-surface) / .82)` + `backdrop-filter: blur(20px) saturate(150%)`.

**Alturas de toque:** botão 46 px · botão pequeno 40 px · chip 40 px ·
item de tab bar 52 px · FAB 52 px. Foco: `outline: 2.5px solid rgb(var(--c-accent)); outline-offset: 2px`.

**Movimento:** `cubic-bezier(.16,1,.3,1)` em 160–1100 ms. Entrada anima o número-herói
(count-up), o anel da meta (stroke-dashoffset), as barras diárias (stagger de 16 ms) e
as barras de progresso. Tudo desligado sob `prefers-reduced-motion`.

---

## 4. Layout

- **Mobile é o desenho principal.** Header compacto (56 px, translúcido) +
  conteúdo em cartões empilháveis + **barra inferior fixa** com 4 destinos
  (Dashboard · Entradas · Metas · Sócios) e um "Mais" que abre um bottom sheet
  com os 10 itens reais agrupados em Operação / Acompanhamento / Administração.
  FAB "Nova entrada" flutuando acima da tab bar.
- **Desktop reaproveita os MESMOS cartões** numa grade de 12 colunas
  (`max-width: 1360px`), com a navegação migrando para sidebar de 264 px.
  Padrão de composição: 8 + 4 (gráfico + painel), herói 7 + stats 5.
- Tabela só aparece no desktop; no celular a mesma entrada vira cartão de lista.
- O protótipo abre com um **seletor Celular / Desktop** no topo para avaliação.

---

## 5. `tailwind.config.ts` — o `extend` que a proposta exige

```ts
extend: {
  colors: {
    canvas:        'rgb(var(--c-canvas) / <alpha-value>)',
    surface:       'rgb(var(--c-surface) / <alpha-value>)',
    elevated:      'rgb(var(--c-elevated) / <alpha-value>)',
    sunken:        'rgb(var(--c-sunken) / <alpha-value>)',
    line:          'rgb(var(--c-line) / <alpha-value>)',
    'line-strong': 'rgb(var(--c-line-strong) / <alpha-value>)',
    ink:           'rgb(var(--c-ink) / <alpha-value>)',
    'ink-muted':   'rgb(var(--c-ink-muted) / <alpha-value>)',
    'ink-faint':   'rgb(var(--c-ink-faint) / <alpha-value>)',
    'ink-invert':  'rgb(var(--c-ink-invert) / <alpha-value>)',
    accent:        'rgb(var(--c-accent) / <alpha-value>)',
    'accent-deep': 'rgb(var(--c-accent-deep) / <alpha-value>)',
    positive:      'rgb(var(--c-accent) / <alpha-value>)',   // lucro = acento
    negative:      'rgb(var(--c-negative) / <alpha-value>)',
    warning:       'rgb(var(--c-warning) / <alpha-value>)',
  },
  fontSize: {
    '2xs':   ['0.656rem', { lineHeight: '1rem', letterSpacing: '0.16em' }], // 10,5px rótulo
    'num-md':['1rem',     { lineHeight: '1.2',  letterSpacing: '-0.015em' }],
    'num-lg':['1.4375rem',{ lineHeight: '1.05', letterSpacing: '-0.03em' }],
    'num-xl':['2rem',     { lineHeight: '1',    letterSpacing: '-0.035em' }],
    'hero':  ['2.875rem', { lineHeight: '0.92', letterSpacing: '-0.045em' }], // 46px
    'hero-lg':['4.375rem',{ lineHeight: '0.92', letterSpacing: '-0.045em' }], // 70px
  },
  fontWeight: { 650: '650', 750: '750' },
  borderRadius: { md: '0.75rem', lg: '1rem', xl: '1.25rem', '2xl': '1.5rem' },
  boxShadow: {
    card: '0 1px 0 rgb(255 255 255 / .035) inset, 0 2px 6px -2px rgb(0 0 0 / .55)',
    raised: '0 1px 0 rgb(255 255 255 / .05) inset, 0 14px 36px -18px rgb(0 0 0 / .85)',
    hero: '0 18px 44px -20px rgb(var(--c-accent) / .45), 0 2px 0 rgb(255 255 255 / .18) inset',
    pop: '0 32px 80px -24px rgb(0 0 0 / .85), 0 0 0 1px rgb(255 255 255 / .06)',
  },
  spacing: { 'tab': '4.5rem', 'safe-b': 'env(safe-area-inset-bottom)' },
  transitionTimingFunction: { placar: 'cubic-bezier(.16,1,.3,1)' },
  keyframes: {
    'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
    'page-in':  { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
    'pop-in':   { from: { opacity: '0', transform: 'scale(.97) translateY(10px)' }, to: { opacity: '1', transform: 'none' } },
  },
  animation: {
    'sheet-up': 'sheet-up 280ms cubic-bezier(.16,1,.3,1)',
    'page-in':  'page-in 260ms cubic-bezier(.16,1,.3,1)',
    'pop-in':   'pop-in 220ms cubic-bezier(.16,1,.3,1)',
  },
  backdropBlur: { bar: '20px' },
}
```

Componentes que valem virar `@layer components` no `globals.css`:
`.card` (surface + line + `--r-lg` + `--sh-2`), `.lbl` (rótulo caixa-alta),
`.hero-block` (bloco lima com tinta invertida), `.badge-*` (placar de status),
`.gauge` (medidor de stop), `.tabbar`, `.chip`.

---

## 6. A ideia, em cinco linhas

1. Os sócios conferem a banca pelo celular, várias vezes por dia, em 5 segundos —
   a tela precisa responder **"como estamos?"** antes de qualquer rolagem.
2. Por isso um único número-herói (o lucro do mês) num bloco de cor sólida, com o
   anel da meta ao lado; todo o resto é apoio, em cartões que respiram.
3. A disciplina tem o mesmo peso visual do lucro: o controle de risco é um painel
   de **medidores de segurança**, não um rodapé, e o jogo responsável ganha cartão próprio.
4. Um acento só (lima), um negativo (vermelho) e um alerta (âmbar): energia de app
   de esporte, sem estética de cassino — o carvão quente segura o tom.
5. **Melhor para:** grupos que operam no celular e querem status instantâneo e
   compartilhável; menos indicada para quem passa o dia numa planilha densa no desktop.
