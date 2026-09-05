# TOKENS — Proposta 1 · "Mesa de Operações"

Protótipo: `proposta-1-mesa-de-operacoes.html`

---

## 1. A ideia central (5 linhas)

1. Quem administra a banca é **operador**, não apostador: a tela é um posto de trabalho, não um feed.
2. O layout é feito de **linhas de 1px e grades encostadas** — painéis de terminal, não cards flutuantes com sombra.
3. **Cor só no dinheiro e no status**: o chrome é cinza-azulado sem saturação; verde, vermelho e âmbar aparecem em valores e limites.
4. **Mono manda**: números e rótulos em monoespaçada com tracking largo, 11–13px, tudo alinhado à direita e com sinal explícito.
5. **Melhor para**: sócio administrador que abre o app todo dia no desktop, quer ver 40 números de relance, opera por teclado e desconfia de UI que "comemora" lucro.

---

## 2. Paleta — CSS custom properties (formato do `globals.css`)

```css
:root {
  /* superfícies: degraus muito sutis, quase preto-azulado */
  --c-canvas: 8 10 13;          /* fundo da aplicação, fundo das tabelas de scroll */
  --c-surface: 13 16 20;        /* corpo dos painéis */
  --c-elevated: 18 22 27;       /* cabeçalho de painel, topbar, statusbar, thead */
  --c-raised: 23 28 34;         /* botão secundário, chips */

  /* linhas — o elemento estrutural principal desta proposta */
  --c-line: 31 37 45;           /* divisórias internas, gaps do grid (1px) */
  --c-line-strong: 48 57 68;    /* bordas externas, inputs, segmento apagado do VU */

  /* tinta */
  --c-ink: 220 227 234;         /* números-âncora e valores em destaque */
  --c-ink-muted: 155 165 176;   /* corpo de tabela, texto padrão */
  --c-ink-faint: 118 130 143;   /* rótulos mono em caixa-alta, eixos, hints (AA ≥ 4,7:1) */

  /* acento frio único: foco, seleção, projeção, "em aberto" */
  --c-accent: 92 174 199;
  --c-accent-soft: 20 44 54;    /* fundo do item ativo do menu e do botão primário */

  /* dinheiro e status — dessaturados e precisos */
  --c-positive: 62 168 122;
  --c-negative: 214 102 92;
  --c-warning: 214 165 74;
  --c-neutral: 118 130 143;     /* void / neutro = mesmo valor de ink-faint */

  color-scheme: dark;
}
```

**Regra de uso da cor:** nenhum elemento de chrome (fundo, borda, ícone de menu, cabeçalho)
usa `positive/negative/warning`. Essas três só aparecem em: valor monetário, badge de status,
segmento aceso de medidor, barra de gráfico, e a borda-esquerda de 2px de um aviso.
O `accent` é reservado a foco, seleção, item de menu ativo, "em aberto" e **projeção**.

### Contraste verificado (sobre `--c-surface`)

| par | razão | uso |
| --- | --- | --- |
| ink / surface | 14,7:1 | valores-âncora |
| ink-muted / surface | 7,6:1 | corpo de tabela |
| ink-faint / surface | 4,87:1 | rótulos mono 9–10px |
| positive / surface | 6,4:1 | lucro |
| negative / surface | 5,4:1 | prejuízo |
| warning / surface | 8,5:1 | alerta |
| accent / surface | 7,6:1 | foco e projeção |

---

## 3. Tipografia

```css
--f-sans: ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--f-mono: ui-monospace, "Cascadia Mono", "Cascadia Code", Consolas, "SFMono-Regular",
          Menlo, "Liberation Mono", monospace;
```

Mono é **dominante**: todos os números, todos os rótulos de coluna/label e todo o menu.
Sans só em texto corrido (descrição de página, `.rule`, parágrafo de aviso).

| token | tamanho / entrelinha | peso | tracking | onde |
| --- | --- | --- | --- | --- |
| `label-xs` | 9px / 1.2 | 600 | `.16em` UPPER | rótulo de célula métrica, eixo do gráfico |
| `label-sm` | 10px / 1.2 | 600 | `.14em` UPPER | `.lbl`, título de painel, statusbar, kbd |
| `label-md` | 10.5px / 1.2 | 600 | `.18em` UPPER | `<h2>` de painel, título de modal |
| `body-xs` | 10.5px / 1.55 | 400 | 0 | `.rule`, textos de responsabilidade |
| `body-sm` | 11px / 1.5 | 400 | 0 | descrição da página, corpo de aviso |
| `num-sm` | 11.5px / 1.45 | 400 | 0 | célula de tabela, input |
| `num-md` | 13px / 1.3 | 400 | 0 | valor de célula métrica |
| `num-lg` | 20px / 1.15 | 400 | `-.01em` | stake máxima, número secundário |
| `num-xl` | 26px / 1.15 | 400 | `-.02em` | os 4 KPIs do topo (22px < 1180px) |
| `page-title` | 12px / 1.2 | 600 | `.20em` UPPER | `<h1>` da página |

Pesos usados: **400** (tudo que é número) e **600** (rótulos em caixa-alta). Nada de 700+.
`font-variant-numeric: tabular-nums` em todo número; sinal `+` / `−` (U+2212) sempre explícito
e coluna de dinheiro sempre alinhada à direita.

---

## 4. Raios, sombras, bordas, espaçamento

```css
--radius: 0;            /* zero. sem exceção, inclusive inputs, botões e modal */
--border: 1px solid rgb(var(--c-line));
--border-strong: 1px solid rgb(var(--c-line-strong));
--shadow: none;         /* profundidade vem de degrau de superfície + linha, nunca de sombra */
--overlay: rgb(0 0 0 / .72);   /* única "sombra" do sistema: o scrim do modal */
```

Escala de espaçamento (múltiplos de 1px, apertada de propósito):

| token | valor | uso |
| --- | --- | --- |
| `space-1` | 2px | gap entre segmentos do medidor VU |
| `space-2` | 4px | gap interno de rótulo → valor |
| `space-3` | 6px | gap entre controles |
| `space-4` | 8px | padding horizontal de célula de tabela |
| `space-5` | 10px | padding padrão de painel (`.pb`, `.ph`) |
| `space-6` | 12px | padding do modal e do login |

Alturas fixas do sistema:

| elemento | altura |
| --- | --- |
| barra de status superior | 46px (52px em ≤900px) |
| sidebar | 200px de largura |
| item de menu | 32px (44px em ≤900px) |
| cabeçalho de painel | 27px |
| `thead` | 26px |
| linha de tabela | **30px** |
| botão / input | 30px (40px em ≤900px) |
| barra de status inferior | 26px |
| medidor VU | 9px (12px na barra da meta) |

**Grade:** `.board { display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:1px; background:rgb(var(--c-line)); }`
— o "gap" de 1px é a linha divisória. Painéis encostam; nenhum flutua.
Breakpoints: 12 col → 4 col (≤1180px) → 1 col (≤700px).

---

## 5. `tailwind.config.ts` — o `extend` que a proposta exige

```ts
extend: {
  colors: {
    canvas:        'rgb(var(--c-canvas) / <alpha-value>)',
    surface:       'rgb(var(--c-surface) / <alpha-value>)',
    elevated:      'rgb(var(--c-elevated) / <alpha-value>)',
    raised:        'rgb(var(--c-raised) / <alpha-value>)',
    line:          'rgb(var(--c-line) / <alpha-value>)',
    'line-strong': 'rgb(var(--c-line-strong) / <alpha-value>)',
    ink:           'rgb(var(--c-ink) / <alpha-value>)',
    'ink-muted':   'rgb(var(--c-ink-muted) / <alpha-value>)',
    'ink-faint':   'rgb(var(--c-ink-faint) / <alpha-value>)',
    accent:        'rgb(var(--c-accent) / <alpha-value>)',
    'accent-soft': 'rgb(var(--c-accent-soft) / <alpha-value>)',
    positive:      'rgb(var(--c-positive) / <alpha-value>)',
    negative:      'rgb(var(--c-negative) / <alpha-value>)',
    warning:       'rgb(var(--c-warning) / <alpha-value>)',
    neutral:       'rgb(var(--c-neutral) / <alpha-value>)',
  },
  fontFamily: {
    sans: ['ui-sans-serif','system-ui','Segoe UI','Roboto','Helvetica Neue','Arial','sans-serif'],
    mono: ['ui-monospace','Cascadia Mono','Cascadia Code','Consolas','SFMono-Regular','Menlo','monospace'],
  },
  fontSize: {
    '3xs':  ['0.5625rem', { lineHeight: '0.75rem', letterSpacing: '0.16em' }], // 9px
    '2xs':  ['0.625rem',  { lineHeight: '0.875rem', letterSpacing: '0.14em' }], // 10px
    'xs+':  ['0.65625rem',{ lineHeight: '0.875rem', letterSpacing: '0.18em' }], // 10.5px
    'num':  ['0.71875rem',{ lineHeight: '1.05rem' }],                           // 11.5px
    'num-md': ['0.8125rem',{ lineHeight: '1.05rem' }],                          // 13px
    'num-lg': ['1.25rem', { lineHeight: '1.4rem' }],                            // 20px
    'num-xl': ['1.625rem',{ lineHeight: '1.9rem', letterSpacing: '-0.02em' }],  // 26px
  },
  letterSpacing: { term: '0.14em', 'term-wide': '0.20em' },
  borderRadius: { none: '0', DEFAULT: '0', sm: '0', md: '0', lg: '0', xl: '0', '2xl': '0' },
  boxShadow: { card: 'none', pop: 'none', focus: '0 0 0 1px rgb(var(--c-accent))' },
  spacing: { '0.25': '1px', '0.75': '3px', '1.25': '5px', '2.25': '9px', '2.75': '11px' },
  height: {
    row: '30px', head: '26px', ctl: '30px', 'ctl-lg': '40px',
    nav: '32px', top: '46px', status: '26px', panelhead: '27px',
  },
  width: { side: '200px' },
  transitionDuration: { DEFAULT: '120ms' },
  keyframes: { 'nav-in': { from:{transform:'translateX(-100%)'}, to:{transform:'translateX(0)'} } },
  animation: { 'nav-in': 'nav-in 160ms ease-out' },
}
```

Substituir no `globals.css`:

```css
@layer components {
  /* o "card" desta proposta não tem raio nem sombra */
  .panel      { @apply bg-surface; }
  .panel-head { @apply flex min-h-[27px] items-center gap-2 border-b border-line bg-elevated px-2.5
                       font-mono text-xs+ font-semibold uppercase tracking-term text-ink-muted; }
  .board      { @apply grid grid-cols-12 gap-px bg-line; }
  .field-label{ @apply mb-0.75 block font-mono text-3xs font-semibold uppercase tracking-term text-ink-faint; }
  .input-base { @apply h-[30px] w-full rounded-none border border-line-strong bg-canvas px-2
                       font-mono text-num tabular-nums text-ink
                       focus:border-accent focus:shadow-focus focus:outline-none; }
  .table-head { @apply sticky top-0 z-10 h-head bg-elevated text-left font-mono text-3xs
                       font-semibold uppercase tracking-term text-ink-faint; }
  .row        { @apply h-row border-b border-line odd:bg-white/[0.016] hover:bg-accent/[0.08]; }
  .kbd        { @apply border border-line-strong bg-canvas px-1 py-0.5 font-mono text-[9px] text-ink-faint; }
}
:focus-visible { outline: 2px solid rgb(var(--c-accent)); outline-offset: 1px; }
```

---

## 6. Componentes assinatura desta proposta

- **Medidor VU segmentado** (`.vu`): 20 segmentos de 2px de gap, altura 9px. Substitui toda
  `ProgressBar` do sistema atual. Em modo `ok` os segmentos acima de 75% acendem em âmbar e
  acima de 90% em vermelho — o operador vê a aproximação do stop pela cor, sem ler o número.
- **Barra de status superior fixa**: banca atual · P&L do dia · P&L do mês · ROI · exposição ·
  sparkline · seletor de mês · identidade. Sempre visível, em qualquer tela.
- **Barra de status inferior de 26px**: sessão, fuso, relógio e a legenda dos atalhos.
  Também é o canal de mensagens do sistema (`flash()`).
- **Atalhos reais**: `D` `E` `M` `S` navegam, `N` abre nova entrada, `/` foca a busca,
  `?` abre a lista, `ESC` fecha. Os `.kbd` ficam impressos na própria UI.
- **Gráficos de terminal**: grade pontilhada, eixos mono de 9px, linha de 1–1,6px, área de
  preenchimento a 10%, crosshair com readout numérico acima do gráfico. Futuro sempre pontilhado
  em `accent` — a projeção nunca usa verde, para não parecer lucro conquistado.
- **Aviso de risco**: borda-esquerda de 2px + fundo a 7% da cor do tom. Sem ícone colorido grande,
  sem caixa arredondada. O texto sempre repete a regra do produto ("o sistema não aumenta limites
  sozinho nem sugere elevar stake para recuperar prejuízo").
