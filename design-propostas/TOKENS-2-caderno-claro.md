# TOKENS — Proposta 2 · "Caderno Claro"

Relatório editorial em modo claro. Papel quente, tinta quase preta, hairlines,
serif nos títulos e nos números-âncora, sans no restante.

---

## 1. Ideia central (5 linhas)

1. A banca é um **livro-caixa entre sócios**, não uma mesa de trading: o que gera confiança é a clareza de um relatório bem diagramado.
2. Cada tela é um **capítulo numerado** (§ I, § II…) com título, olho em itálico, regras horizontais e notas de rodapé — qualquer sócio abre e entende sozinho.
3. O dinheiro é o herói: quatro números-âncora em serif grande, tabulares, e todo o resto em cinza-tinta discreto.
4. Cor com parcimônia: um verde-garrafa único como acento; verde e vermelho escuros, do tipo que funciona impresso.
5. **Melhor para:** grupos de sócios que precisam prestar contas uns aos outros, leitura no desktop, exportação/impressão e quem se incomoda com estética de cassino.

---

## 2. Paleta — CSS custom properties (formato do `globals.css`, RGB separado por espaço)

```css
:root {
  /* superfícies — papel levemente quente, nunca branco puro */
  --c-canvas: 250 248 244;      /* #FAF8F4 fundo da página */
  --c-surface: 255 254 251;     /* #FFFEFB painéis e modais */
  --c-elevated: 243 240 233;    /* #F3F0E9 hover de linha, trilhos */
  --c-line: 224 219 209;        /* #E0DBD1 hairline padrão */
  --c-line-strong: 186 179 166; /* #BAB3A6 borda de campo/painel */
  --c-rule: 26 26 24;           /* #1A1A18 régua grossa de cabeçalho */

  /* tinta */
  --c-ink: 26 26 24;            /* #1A1A18 texto e números */
  --c-ink-muted: 90 87 80;      /* #5A5750 legendas (6,8:1) */
  --c-ink-faint: 110 106 97;    /* #6E6A61 metadados (5,1:1) */

  /* acento único + resultado */
  --c-accent: 20 74 60;         /* #144A3C verde-garrafa (9,3:1) */
  --c-accent-soft: 226 236 231; /* #E2ECE7 realce de item ativo */
  --c-positive: 22 92 62;       /* #165C3E lucro (7,5:1) */
  --c-negative: 150 36 32;      /* #962420 prejuízo (7,9:1) */
  --c-warning: 140 92 12;       /* #8C5C0C atenção */
  --c-neutral: 118 112 102;     /* #767066 void / neutro */

  /* faixas do gráfico de participação */
  --seg1: #144A3C; --seg2: #2F6B57; --seg3: #5A9080; --seg4: #98B8AC;

  color-scheme: light;
}

/* modo escuro opcional — mesmo caderno, papel invertido */
:root[data-theme='dark'] {
  --c-canvas: 20 19 17;
  --c-surface: 28 27 24;
  --c-elevated: 37 35 31;
  --c-line: 56 53 47;
  --c-line-strong: 88 83 74;
  --c-rule: 214 208 195;
  --c-ink: 240 236 228;
  --c-ink-muted: 178 172 160;
  --c-ink-faint: 146 140 128;
  --c-accent: 126 186 158;
  --c-accent-soft: 33 48 42;
  --c-positive: 116 187 141;
  --c-negative: 226 130 118;
  --c-warning: 214 165 84;
  --c-neutral: 150 144 132;
  --seg1: #7EBA9E; --seg2: #5E9A80; --seg3: #417766; --seg4: #2C5648;
  color-scheme: dark;
}
```

> O padrão é o claro. O escuro existe para leitura noturna, mas o capricho tipográfico
> e a calibração de contraste foram feitos no claro.

---

## 3. Tipografia

Duas famílias, ambas do sistema — zero rede.

```css
--font-serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua",
              Georgia, "Times New Roman", serif;
--font-sans:  ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
              "Helvetica Neue", Arial, sans-serif;
--font-mono:  ui-monospace, "Cascadia Mono", "Segoe UI Mono", Consolas, monospace;
```

**Regra de uso:** serif em `h1–h4`, nos números-âncora (figuras, stake máxima, totais
grandes) e nas citações. Sans em corpo, tabelas, rótulos e navegação. Mono não é usado —
o alinhamento vem de `font-variant-numeric: tabular-nums`, não da monoespaçada.

| Papel | Família | Tamanho | Peso | Entrelinha | Extra |
| --- | --- | --- | --- | --- | --- |
| Título de tela (`h1`) | serif | `clamp(30px, 5vw, 46px)` | 600 | 1.08 | `letter-spacing: -0.02em` |
| Olho / dek | serif itálico | `clamp(15px, 2vw, 18px)` | 400 | 1.55 | cor `ink-muted` |
| Sumário executivo (`.lede`) | serif | 18.5px | 400 | 1.62 | medida 66ch, capitular de 62px |
| Título de capítulo (`h2`) | serif | `clamp(21px, 2.6vw, 27px)` | 600 | 1.2 | precedido de régua 2px |
| Marcador de capítulo (`§ I`) | serif itálico | 15px | 400 | — | cor `ink-faint` |
| Número-âncora | serif | `clamp(26px, 3.4vw, 36px)` | 600 | 1.05 | tabular |
| Subtítulo de painel (`h3`) | serif | 20px | 600 | 1.3 | — |
| Corpo | sans | 15px | 400 | 1.6 | medida máx. 68ch (`.measure`) |
| Tabela — célula | sans | 14px | 400/500 | 1.5 | tabular |
| Tabela — cabeçalho | sans | 10.5px | 700 | — | `uppercase`, `letter-spacing: .1em` |
| Versalete (`.smallcaps`) | sans | 11px | 600 | — | `uppercase`, `letter-spacing: .13em` |
| Legenda de figura | sans | 12.5px | 400 | 1.55 | rótulo "Figura n" em versalete |
| Nota de rodapé | sans | 12.5px | 400 | 1.6 | cor `ink-muted`, medida 78ch |
| Chamada de nota (`sup.fn`) | sans | 10px | 700 | — | cor `accent` |
| Navegação | sans | 12px | 600 | — | `uppercase`, `letter-spacing: .07em` |

**Números:** `font-variant-numeric: tabular-nums` em `.num`, `table` e nos números-âncora.
Formato sempre BR — `R$ 1.234,56`, `04/09/2026`, `61,4%`. Resultado com sinal explícito
(`+R$ 384,00`, `−R$ 227,50`) usando o menos tipográfico U+2212, nunca o hífen.

---

## 4. Raios, sombras, bordas

Papel não tem cantos redondos generosos nem sombra difusa. Tudo é quase reto.

```css
--r-sm: 2px;   /* selos de status, itens de menu */
--r-md: 3px;   /* botões, campos com moldura, dropdown */
--r-lg: 4px;   /* painéis, modal */
/* sem raio nos gráficos, nas barras de progresso e nas tabelas */

--shadow-raise: 0 1px 0 rgb(26 26 24 / .04);                                  /* painel */
--shadow-pop: 0 24px 60px -24px rgb(26 26 24 / .30), 0 2px 6px rgb(26 26 24 / .06); /* modal, dropdown, toast */
```

**Regras horizontais (a assinatura da proposta):**

| Uso | Estilo |
| --- | --- |
| Abertura de capítulo | `border-top: 2px solid rgb(var(--c-rule))` |
| Subcapítulo | `border-top: 1px solid rgb(var(--c-line))` |
| Cabeçalho de tabela | `border-bottom: 2px solid rgb(var(--c-rule))` |
| Linha de tabela | `border-bottom: 1px solid rgb(var(--c-line))` |
| Linha de total | `border-top: 3px double rgb(var(--c-rule))` |
| Condutor pontilhado | `border-bottom: 1px dotted rgb(var(--c-line-strong))` |
| Campo de formulário | só `border-bottom: 1px solid rgb(var(--c-line-strong))` |
| Pull quote | `border-left: 3px solid rgb(var(--c-accent))` |

---

## 5. Espaçamento e ritmo vertical

Base 4px; o ritmo do relatório usa os múltiplos maiores.

| Token | px | Onde |
| --- | --- | --- |
| `1` | 4 | ajustes finos |
| `2` | 8 | rótulo → valor |
| `3` | 12 | dentro de um bloco |
| `4` | 16 | entre campos |
| `5` | 20 | padding de célula de calendário |
| `6` | 24 | padding lateral da folha |
| `7` | 28 | padding interno de painel (22px no compacto) |
| `9` | 36 | entre figura e legenda + folga |
| `11` | 44 | entre blocos de um capítulo |
| `13` | 52 | **entre capítulos** |
| `14` | 56 | antes das notas de rodapé |

Largura: folha `max-width: 1180px` com `padding: 0 24px` (18px ≤900, 14px ≤560).
Medida de leitura: `.measure { max-width: 68ch }`, `.lede { max-width: 66ch }`.
Altura de linha de tabela: 14px de padding vertical (linha alta, confortável).

---

## 6. `tailwind.config.ts` — o `extend` que a proposta exige

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        elevated: 'rgb(var(--c-elevated) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        'line-strong': 'rgb(var(--c-line-strong) / <alpha-value>)',
        rule: 'rgb(var(--c-rule) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--c-ink-muted) / <alpha-value>)',
        'ink-faint': 'rgb(var(--c-ink-faint) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-soft': 'rgb(var(--c-accent-soft) / <alpha-value>)',
        positive: 'rgb(var(--c-positive) / <alpha-value>)',
        negative: 'rgb(var(--c-negative) / <alpha-value>)',
        warning: 'rgb(var(--c-warning) / <alpha-value>)',
        neutral: 'rgb(var(--c-neutral) / <alpha-value>)',
      },
      fontFamily: {
        serif: ['Iowan Old Style', 'Palatino Linotype', 'Palatino', 'Book Antiqua',
                'Georgia', 'Times New Roman', 'serif'],
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto',
               'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'Cascadia Mono', 'Segoe UI Mono', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.65625rem', { lineHeight: '0.875rem', letterSpacing: '0.1em' }], // 10.5px
        caps: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.13em' }],      // 11px
        lede: ['1.15625rem', { lineHeight: '1.62' }],                              // 18.5px
        figure: ['2.25rem', { lineHeight: '1.05', letterSpacing: '-0.02em' }],     // 36px
        title: ['2.875rem', { lineHeight: '1.08', letterSpacing: '-0.02em' }],     // 46px
      },
      maxWidth: { measure: '68ch', lede: '66ch', notes: '78ch', sheet: '1180px' },
      borderRadius: { sm: '2px', DEFAULT: '3px', md: '3px', lg: '4px', xl: '4px' },
      borderWidth: { 3: '3px' },
      boxShadow: {
        raise: '0 1px 0 rgb(26 26 24 / 0.04)',
        pop: '0 24px 60px -24px rgb(26 26 24 / 0.30), 0 2px 6px rgb(26 26 24 / 0.06)',
      },
      spacing: { chapter: '3.25rem', block: '2.75rem' }, // 52px / 44px
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(8px)' },
                to: { opacity: '1', transform: 'none' } },
      },
      animation: { rise: 'rise 180ms cubic-bezier(.2,.8,.3,1)' },
    },
  },
  plugins: [],
};

export default config;
```

### Componentes utilitários sugeridos (`@layer components`)

```css
.chapter    { @apply mt-chapter; }
.chapter > header { @apply border-t-2 border-rule pt-3.5 mb-5; }
.report-th  { @apply border-b-2 border-rule pb-2 px-3 text-2xs font-bold uppercase
                     tracking-[.1em] text-ink-muted text-left; }
.report-td  { @apply border-b border-line px-3 py-3.5 align-top; }
.report-total { @apply border-t-[3px] border-double border-rule font-bold pt-3; }
.leader-dots { @apply flex-1 border-b border-dotted border-line-strong -translate-y-1; }
.input-rule { @apply w-full min-h-[42px] border-0 border-b border-line-strong bg-transparent
                     px-0.5 py-2 rounded-none focus:border-accent focus:shadow-[0_1px_0_0_rgb(var(--c-accent))]
                     focus:outline-none; }
.pullquote  { @apply border-l-[3px] border-accent pl-5 font-serif italic; }
```

---

## 7. Gráficos (SVG desenhado à mão, sem biblioteca)

- **Sem legenda solta:** rótulo direto no fim de cada série ("META R$ 3.000,00",
  "PROJEÇÃO R$ 1.842,50") e no ponto de hoje ("R$ 573,50 · realizado apurado").
- **Meta** = linha fina de tinta a 55% de opacidade. **Realizado** = 2,6px no acento,
  com área a 8% embaixo do trecho apurado; **projeção** = 1,6px pontilhada a 55%.
- Linha vertical tracejada em 04/09 com o rótulo `HOJE · 04/09`.
- Barras de resultado diário: sólidas nos dias apurados, **vazadas com contorno
  tracejado** nos dias projetados; anotação com linha-guia só no melhor e no pior dia.
- Grade: hairlines `--c-line`; a linha do zero usa `--c-ink-faint`.
- Toda figura tem legenda em prosa explicando o que ela mostra — o gráfico nunca fica sozinho.

---

## 8. Estados

| Estado | Tratamento |
| --- | --- |
| Hover (linha de tabela) | `bg-elevated/70`, sem deslocamento |
| Hover (botão) | fundo `elevated` + borda `ink-faint` |
| Ativo (`:active`) | `translateY(1px)` |
| Foco | `outline: 2px solid rgb(var(--c-accent)); outline-offset: 2px` |
| Foco em campo | régua inferior vira acento + `box-shadow: 0 1px 0 0 accent` |
| Nav ativo | regra de 2px em acento sob o item (desktop); faixa `accent-soft` + barra à esquerda (gaveta) |
| Vazio | moldura tracejada, título em serif e ação de limpar filtro |
| Aviso de limite | callout com barra esquerda `warning`; ao estourar a stake vira `negative` e revela o campo "Motivo da exceção" |
| Limite atingido | callout `negative` + bloqueio do registro (nunca sugestão de aumentar stake) |

Alvos de toque ≥ 40px (botões, links de menu, itens da gaveta com 44px).

---

## 9. O que NÃO fazer nesta proposta

- Branco puro `#FFF` de fundo, sombra difusa de card, cantos de 12px.
- Neon, gradiente, badge colorido preenchido, ícone decorativo dentro de métrica.
- Mono em todo lugar; densidade apertada; legenda de gráfico solta no rodapé.
- Qualquer copy que sugira recuperar prejuízo, garantir lucro ou elevar limite.
