# Brief — 3 propostas de design para o "Banca" (gestão de banca esportiva)

## Contexto do produto
App Next.js 15 + Tailwind + Postgres, todo em **português do Brasil**, para
administrar uma banca de apostas esportivas dividida entre sócios. Público:
2–6 sócios adultos acompanhando dinheiro real, no desktop e no celular.
Tom: sóbrio, responsável, nunca "cassino". A regra do produto é explícita:
o sistema **nunca** trata lucro como garantido, nunca aumenta limites sozinho
e nunca sugere aumentar stake para recuperar prejuízo. O design tem que
transmitir controle, não euforia.

Código de referência (leia para ser fiel ao CONTEÚDO; NÃO copie o estilo atual):

- `src/app/(app)/dashboard/page.tsx` — a tela mais importante
- `src/app/(app)/entradas/page.tsx` + `src/components/entries/*`
- `src/components/layout/app-shell.tsx` e `nav-items.tsx` — navegação real
- `src/components/ui/*` — card, stat, badge, button, modal, money
- `src/app/globals.css` e `tailwind.config.ts` — tokens ATUAIS (o que vamos substituir)
- `src/app/login/*`

## O que você entrega

**Um único arquivo HTML autocontido**, no caminho que foi indicado a você.
Requisitos duros:

1. **Zero rede.** Nenhum CDN, nenhum Google Fonts, nenhuma imagem externa.
   CSS e JS inline; ícones em SVG inline; fontes = system font stack
   (`ui-sans-serif, system-ui, "Segoe UI", Roboto, ...`) e, para números,
   `ui-monospace, "Cascadia Mono", Consolas, monospace` se o seu conceito pedir.
   O arquivo tem que abrir bonito com duplo clique, offline.
2. **Protótipo navegável.** Navegação real e um roteador em JS puro
   (esconde/mostra `<section>`) com **no mínimo** estas telas:
   - **Login**
   - **Dashboard** (a mais completa — ver lista de blocos abaixo)
   - **Entradas** (tabela + filtros + botão "Nova entrada" abrindo um modal com formulário)
   - **Metas diárias** (grade/calendário de dias com meta × realizado)
   - **Sócios** (participação e rateio)

   Os demais itens do menu podem existir como placeholder elegante ("em construção"),
   mas as cinco telas acima precisam estar desenhadas de verdade.
3. **Responsivo.** Funciona a partir de 360 px de largura. No mobile a sidebar
   vira menu deslizante ou barra inferior — decisão sua, mas tem que funcionar
   de verdade (clicar e abrir).
4. **Acessível.** Contraste mínimo AA para texto, `:focus-visible` visível,
   alvos de toque ≥ 40 px, `aria-label` nos botões só de ícone.
5. **Gráficos em SVG inline** desenhados por você (nada de biblioteca): a
   evolução acumulada meta × realizado do mês, e pelo menos um segundo gráfico
   (barras de lucro/prejuízo por dia, ou o que o seu conceito pedir).
6. **Números tabulares** (`font-variant-numeric: tabular-nums`) em toda coluna
   de dinheiro. Verde = lucro, vermelho = prejuízo, e sinal explícito (+/−).
7. Formato brasileiro em tudo: `R$ 1.234,56`, datas `04/09/2026`, `%` com vírgula.

## Dataset OBRIGATÓRIO (idêntico nas 3 propostas, para a comparação ser justa)

Banca: **Banca Compartilhada** · usuário logado: **Cesar Lima** (Administrador)
Mês exibido: **Setembro de 2026** · hoje: **04/09/2026**

- Banca inicial: R$ 5.000,00 · Banca atual: R$ 6.842,50 (+R$ 1.842,50)
- Banca-alvo: R$ 8.000,00 · falta R$ 1.157,50
- Meta do mês: R$ 3.000,00 · lucro do mês: **+R$ 1.842,50** · progresso **61,4%**
- Meta diária: R$ 100,00 · dias ativos: 30
- ROI do mês: **+7,8%** sobre R$ 23.640,00 apostados
- Entradas no mês: 48 · greens 27 · reds 16 · voids 3 · cashouts 2 · em aberto 4
- Taxa de acerto: 62,8% · stake média R$ 492,50 · maior stake R$ 680,00
- Lucro bruto R$ 4.910,00 · prejuízo bruto R$ 3.067,50 · lucro médio/entrada +R$ 41,88
- Exposição em aberto: R$ 1.480,00 · aportes do mês R$ 500,00 · retiradas R$ 300,00
- Controle de risco: stake máxima **R$ 68,42** (1% sobre a banca atual);
  stop diário R$ 12,50 / R$ 205,28 · stop semanal R$ 148,00 / R$ 410,55 ·
  stop mensal R$ 320,00 / R$ 684,25 (nenhum atingido; o semanal está em ~36%)
- Acumulado de todo o histórico: 213 entradas · lucro +R$ 3.284,90 · ROI +5,2% ·
  acerto 60,1% · aportes R$ 5.500,00 · retiradas R$ 1.200,00

**Sócios** (participação → lucro do mês):

| Sócio | Participação | Lucro do mês |
| --- | --- | --- |
| Cesar Lima | 45% | +R$ 829,13 |
| Marina Alves | 30% | +R$ 552,75 |
| Rafael Duarte | 15% | +R$ 276,38 |
| Bruno Teixeira | 10% | +R$ 184,25 |

**Últimas entradas** (data · evento · mercado · responsável · stake · status · resultado):

- 04/09/2026 · Palmeiras × Grêmio · Over 2.5 gols · Cesar Lima · R$ 600,00 · **EM ABERTO** · —
- 04/09/2026 · Real Madrid × Girona · Casa −1.5 AH · Marina Alves · R$ 480,00 · **GREEN** · +R$ 384,00
- 03/09/2026 · Flamengo × Bahia · Ambas marcam · Rafael Duarte · R$ 520,00 · **RED** · −R$ 520,00
- 03/09/2026 · Inter × Bragantino · Under 3.5 gols · Cesar Lima · R$ 450,00 · **GREEN** · +R$ 292,50
- 02/09/2026 · Arsenal × Chelsea · Empate anula · Marina Alves · R$ 380,00 · **VOID** · R$ 0,00
- 02/09/2026 · Botafogo × Cruzeiro · Handicap asiático 0.0 · Bruno Teixeira · R$ 500,00 · **CASHOUT** · +R$ 112,00
- 01/09/2026 · São Paulo × Fortaleza · Over 1.5 gols HT · Cesar Lima · R$ 610,00 · **GREEN** · +R$ 305,00
- 01/09/2026 · Bayern × Leipzig · Casa vence · Rafael Duarte · R$ 540,00 · **RED** · −R$ 540,00

**Entradas em aberto** (4): Palmeiras × Grêmio R$ 600,00 · Milan × Napoli R$ 340,00 ·
Corinthians × Vasco R$ 290,00 · PSG × Lyon R$ 250,00

**Série do mês** (dia · meta acumulada · realizado acumulado, em R$) — use no gráfico:
1: 100 / 305 · 2: 200 / 417 · 3: 300 / 189,50 · 4: 400 / 573,50 ·
depois projete uma curva plausível até o dia 30 chegando em 1.842,50 no realizado.
O realizado "real" só vai até 04/09; do dia 5 em diante desenhe a linha da meta
cheia e o realizado como projeção apagada/pontilhada, deixando claro que é futuro.
**Mantenha os 4 primeiros dias exatos.**

**Menu de navegação (rótulos e grupos reais):**

- Operação: Dashboard · Entradas · Metas diárias
- Acompanhamento: Histórico · Estatísticas · Sócios · Movimentações
- Administração: Fechamento · Configurações · Auditoria

**Blocos que o Dashboard precisa ter** (mesma informação nas 3 propostas —
a ordem, o agrupamento e a forma visual são a SUA proposta):
banca atual · lucro do mês · ROI do mês · meta do mês · barra de progresso da
meta · gráfico de evolução · números do mês (a grade de métricas) · controle de
risco com as barras de stop · últimas entradas · sócios no mês · entradas em
aberto · acumulado histórico.

**Login:** e-mail + senha, nome da banca, e uma frase curta de responsabilidade.
**Modal de nova entrada:** data, evento, mercado, sócio responsável, odd, stake,
status, e um aviso do limite de stake máxima (R$ 68,42).

## Também entregue: `TOKENS.md` (mesma pasta, nome indicado a você)

Documento curto para eu portar a sua proposta para o código real:

- a paleta como CSS custom properties no formato do projeto (`--c-canvas: R G B;`
  em RGB separado por espaço, como no `globals.css` atual);
- escala tipográfica, pesos, raios de borda, sombras, espaçamentos;
- o `extend` do `tailwind.config.ts` que a proposta exige;
- 5 linhas explicando a ideia central do conceito e para quem ele é melhor.

## Ao final: abra no navegador

Abra o seu HTML numa **janela nova do Chrome**, sozinho, com:

```
"/c/Program Files/Google/Chrome/Application/chrome.exe" --new-window "file:///C:/Users/Cesar/Downloads/banca/design-propostas/SEU-ARQUIVO.html"
```

Rode com `run_in_background: true` para não travar a sessão. Se o Chrome falhar,
use o Edge em `/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`.

## Regras de qualidade

- Nada de lorem ipsum, nada de "TODO", nada de bloco vazio.
- Densidade de informação alta, mas hierarquia clara: o dinheiro é o herói.
- Cuide dos estados: hover, foco, ativo, vazio, e o aviso de limite de perda.
- Comprometa-se com o seu conceito. Três variações tímidas do mesmo tema seriam
  um fracasso — a sua proposta tem que ser inconfundível ao lado das outras.
- Trabalhe sozinho: não crie sub-agentes.
- Antes de terminar, reveja o HTML renderizado mentalmente: sem overflow
  horizontal, sem texto cortado, sem contraste ilegível, sem número inventado
  fora do dataset.
