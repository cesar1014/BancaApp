# Prompt de implementação — Aba "Bilhetes"

> Cole tudo abaixo da linha. As fontes foram verificadas uma a uma em 05/09/2026:
> cada uma foi aberta, o conteúdo conferido e o formato transcrito. As ressalvas
> anotadas são reais, não hipotéticas.

---

## CONTEXTO DO PROJETO

Estou construindo uma aba nova chamada **Bilhetes** num aplicativo de gestão de banca
esportiva compartilhada que já existe. Respeite a arquitetura atual.

**Stack:**
- Next.js 15 (App Router), React 19, TypeScript estrito (`strict: true`, sem `any` no domínio)
- PostgreSQL via `pg`, **SQL puro** — sem ORM
- Migrations em SQL versionado (`db/migrations/000N_nome.sql`) com runner próprio
- Tailwind CSS 3, design system "Placar": carvão quente + UM acento lima
  (`--c-accent`, `--c-positive`, `--c-negative`, `--c-warning`), classes `.card`, `.lbl`,
  `.hero-block`, `.gauge`
- Server Actions para escrita, Server Components para leitura
- Validação com Zod
- Testes com runner próprio em `tests/run.ts` (`node:assert`, sem framework)

**Regra de dependência (obrigatória):**
```
app (páginas)  →  services  →  repos  →  db
actions        →  services  →  domain
                     ↓
                  domain  (não importa nada de I/O — 100% testável)
```

**Convenções de precisão (nunca use float para dinheiro ou odd):**

| Grandeza | Representação | Exemplo |
| --- | --- | --- |
| Dinheiro | inteiro de **centavos** (BIGINT) | R$ 50,00 → `5000` |
| Odds | inteiro **× 1000** (`odd_milli`) | 2,15 → `2150` |
| Percentuais | **basis points** (× 100) | 21,8% → `2180` |

**O que já existe e deve ser reaproveitado:**
- `src/lib/sports/*` — camada de dados esportivos com adaptadores de provedor
  (API-Football, Sportmonks, The Odds API, mock), cache com TTL, deduplicação de
  requisições, controle de quota e casamento de partidas entre provedores
- `src/lib/sports/names.ts` — `canonicalize()`, `similarity()`, `teamKey()`
- `src/lib/sports/matching.ts` — `findMatch()`, `matchAll()`, `fixtureKey()`
- `src/lib/bets/math.ts` — `impliedProbabilityBps`, `fairOddMilli`, `valueBps`,
  `removeMarginBps`, `assessValue`
- `src/lib/bets/performance.ts` — ROI, yield, profit factor, recortes
- `src/lib/bets/settlement.ts` — liquidação green/red/push a partir do resultado final
- `src/app/api/dicas/refresh/route.ts` — worker protegido por segredo, chamado por cron

**NÃO reescreva nada disso. Importe e use.**

---

## OBJETIVO

Uma aba **Bilhetes** que mostra, automaticamente, múltiplas prontas publicadas por
fontes públicas — brasileiras e internacionais. O usuário não digita nada: abre a aba e
os bilhetes do dia estão lá.

Três coisas que a aba precisa fazer e que as fontes originais não fazem:

1. **Conferir a odd de verdade.** A fonte diz 1,17; o app cruza com as cotações reais
   do The Odds API e mostra a melhor disponível. Se a odd real for 1,12, a múltipla de
   2,21 na verdade paga 2,05 — e isso aparece antes de o usuário apostar.
2. **Mostrar a margem acumulada.** Numa múltipla, a margem da casa multiplica: cinco
   pernas com 5% de margem cada custam ~23%, não 5%. Esse número tem que estar visível.
3. **Manter o placar de cada fonte.** Registrar o resultado de cada bilhete e acumular
   ROI, yield e profit factor **por fonte**, para descobrir com dados quais valem a pena
   e quais devem ser desligadas.

---

## FONTES VERIFICADAS

Todas foram abertas e conferidas. "HTML server-side" significa que o conteúdo veio no
HTML e dá para extrair sem navegador headless.

### Brasileiras — cobrem Brasileirão, Série B, Copa do Brasil, Libertadores

**1. apostasepalpites.com.br/palpites/** — prioridade máxima
- 11 bilhetes na página, com odd **total** por bilhete, marcados "Hoje"/"Amanhã"
- **7 de 11 bilhetes eram futebol brasileiro** no snapshot (Série A e Série B)
- Campos: título, jogo, competição, horário, mercado por seleção, odd total, justificativa
- **Não tem odd por perna** — só a total
- HTML server-side, cards estruturados
- ⚠️ **Não arquiva.** URLs antigas retornam 410/404. Tem que raspar todo dia.
- Exemplo real:
  > **Tripla da Série B — @ 3.90**
  > Cuiabá – Mais de 0,5 gols — Criciúma x Cuiabá — Hoje 19:30
  > Total de gols – Mais de 1,5 — Athletic x Vila Nova — Hoje 20:30
  > CRB – Resultado Final — CRB x América-MG — Hoje 21:30

**2. aposta10.com** — complemento
- Palpites avulsos com **odd numérica explícita** e nome do tipster: 6 na home, 9 em `/futebol/palpites/hoje`
- Bilhetes prontos em URL datada e previsível: `/blog/bilhetes-prontos-nos-jogos-de-hoje-DDMMAAAA`
- 3 bilhetes/dia (Conservador / Moderado / Ousado)
- HTML server-side, cards limpos
- ⚠️ Cobertura BR fraca em alguns dias (1 de 9 palpites brasileiros no snapshot);
  bilhetes sem odd por perna e com seleções em texto ao redor de uma imagem

**3. sportytrader.com/pt-br** — opcional, se quiser volume BR
- 20+ palpites/dia, páginas dedicadas a Série A, B, C, Copa do Brasil, Libertadores
- Sem bilhete montado; odd inconsistente na listagem

### Internacionais — nenhuma cobre Brasil

**4. predictlix.com/accumulator-tips/** — melhor estrutura de todas
- 18 bilhetes em 6 blocos (Favourites, Doubles, Trebles, Four-Folds, Over/Under 2.5, BTTS)
- **Odd individual decimal por perna + odd total decimal.** Estrutura regular.
- HTML server-side, totalmente raspável
- ⚠️ **Recicla pernas**: os mesmos ~9 jogos alimentam vários bilhetes. Deduplicar.

**5. mightytips.com/football-predictions/accumulator/** — dados mais limpos
- 2 bilhetes/dia em tabela, com **data absoluta** no bilhete (ótimo para dedupe)
- Odd individual decimal + total. Só ligas top europeias.

**6. freesupertips.com/accumulator-tips/** — maior volume, único multi-dia
- 9 bilhetes, de 3 a 11 pernas; mostra hoje, amanhã e datas futuras na mesma página
- ⚠️ **Odds em fração britânica** (`8/13`, `687/1000`) — precisa converter para decimal
- ⚠️ Consistência varia por página: em algumas só o retorno total aparece

**7. apwin.com/accumulator-predictions/** — simples e confiável
- 1 bilhete/dia de 4 pernas, com odd individual e total, mostrando hoje/amanhã/depois

**Descartados após teste (não perca tempo):** goalsnow (sem odd nenhuma),
accuratetip (esqueleto JavaScript, "Loading games…"), footballpredictions.net/win-accumulators
(só manchetes de vitórias passadas), gazetaesportiva (matéria de SEO sem palpite),
clubedaposta (admite que não publica), netflu (glossário), winningarena (bilhetes chegam
com 1 perna e odd total 1.00), windrawwin (403).

**Com ressalva:** thestatbible.com/todays-acca tem Brasil (Série B) e 18 blocos, **mas
paywall corta 2–3 pernas da maioria dos bilhetes**. Só use se tratar bilhete incompleto
explicitamente. tiporacle.com tem estrutura boa mas há sinais de dado possivelmente
sintético — valide 3 dias seguidos antes de confiar.

**Stack recomendado para começar (5 fontes, 5–15 bilhetes/dia):**
apostasepalpites + aposta10 + predictlix + mightytips + apwin

---

## O QUE IMPLEMENTAR

### 1. Migration `db/migrations/0004_bilhetes.sql`

```
tip_sources        fontes: slug, nome, url, país, ativa, notas
tip_slips          bilhete: fonte, título, data de referência, odd total informada,
                   odd total recalculada, margem acumulada em bps, resultado, lucro
tip_slip_legs      perna: bilhete, jogo, competição, horário, mercado, seleção,
                   odd informada (nullable), odd real encontrada (nullable),
                   fixture_key casado (nullable), resultado da perna
tip_source_runs    log de cada coleta: fonte, início, fim, bilhetes achados, erro
```

Pontos obrigatórios do schema:
- `odd_milli` de cada perna é **nullable** — várias fontes só publicam a odd total
- Índice único que impeça o mesmo bilhete entrar duas vezes (fonte + data + hash das
  seleções), porque as fontes republicam o mesmo bilhete em páginas diferentes
- `CHECK` de coerência entre resultado e dinheiro, no mesmo padrão da tabela `entries`
- `fixture_key` referenciando `sport_fixtures(key)` com `ON DELETE SET NULL`

### 2. Adaptadores de fonte — `src/lib/bilhetes/sources/`

Uma interface, um arquivo por fonte:

```ts
export interface SlipSource {
  readonly slug: string;
  readonly label: string;
  readonly url: string;
  readonly country: 'BR' | 'INT';
  fetchSlips(options: { now: Date }): Promise<RawSlip[]>;
}
```

`RawSlip` normalizado: `title`, `referenceDate`, `totalOddMilli | null`,
`legs: { homeName, awayName, league, kickoff, market, selection, oddMilli | null }[]`,
`sourceUrl`.

**Requisitos que não podem faltar:**
- Cada fonte **isolada**. Se o parser de uma quebrar, a aba mostra
  "Fonte X: sem dados hoje" e as outras continuam. Nunca derrube a página inteira.
- Respeitar `robots.txt`, mandar `User-Agent` identificando o app, e **1 requisição por
  fonte por dia** — não martele os sites.
- Antes de escrever parser de HTML, **verifique se a página carrega os dados por uma
  chamada JSON interna** (DevTools → Network). Se tiver, consuma o JSON: é muito mais
  estável que ler `<div>`.
- Conversor de odd fracionária → decimal para o FreeSuperTips (`8/13` → 1615 milli).
- Parser de data em português ("Hoje", "Amanhã", "05/09") e em inglês.

### 3. Casamento com as partidas reais — `src/lib/bilhetes/matching.ts`

Cada perna precisa achar o `fixture_key` correspondente para que a odd real possa ser
conferida. **Reaproveite** `similarity()` e `findMatch()` de `src/lib/sports/`.

- Casou acima do limiar → grava `fixture_key`
- Não casou → a perna fica sem odd real, e o bilhete inteiro é marcado como
  "conferência parcial". **Não invente casamento**: perna casada errado significa mostrar
  a odd de outro jogo, que é pior que não mostrar odd nenhuma.

### 4. Domínio puro — `src/lib/bilhetes/slip.ts`

Funções puras, testáveis sem banco:

- `combinedOddMilli(legs)` — produto das odds das pernas
- `slipMarginBps(legs)` — margem acumulada. Para cada perna com odd real conhecida,
  a margem da perna vem do mercado devigado (use `removeMarginBps` que já existe);
  a margem do bilhete é `(∏(1 + margem_i)) − 1`
- `bestAvailableOddMilli(leg, odds)` — a maior odd entre as casas para aquela seleção
- `slipComparison(slip)` — devolve odd informada × odd real, diferença em bps, e quais
  pernas não puderam ser conferidas
- `settleSlip(legs)` — o bilhete é green só se **todas** as pernas forem green; qualquer
  red derruba tudo; push numa perna reduz a odd total e mantém o bilhete vivo

### 5. Coleta — `src/lib/services/bilhetes.service.ts` + rota de worker

- Estenda `src/app/api/dicas/refresh/route.ts` **ou** crie `/api/bilhetes/refresh`,
  protegida pelo mesmo segredo (`TIPS_WORKER_SECRET`)
- Cron diário. Sugestão: 08:00 e 14:00 (fuso da banca), para pegar o que sai de manhã e
  o que sai à tarde
- **Nenhuma página busca dado externo ao ser aberta.** A tela lê só do banco.
- Cada fonte tem cooldown próprio e registro em `tip_source_runs`

### 6. Liquidação automática

Quando a partida de cada perna terminar (`sport_fixtures.status = 'FINISHED'`),
resolver a perna com `settleTip()` de `src/lib/bets/settlement.ts` e, quando todas as
pernas estiverem resolvidas, fechar o bilhete. O que não der para decidir com segurança
fica **PENDING** para conferência manual — nunca chute um resultado.

### 7. Interface — `src/app/(app)/bilhetes/page.tsx`

Aba nova no menu (`nav-items.tsx`), abas internas: **Hoje · Próximos · Histórico · Fontes**.

Cartão de bilhete, na ordem de leitura:

```
┌──────────────────────────────────────────────────────┐
│ TRIPLA DA SÉRIE B          apostasepalpites  ·  Hoje │
│                                                       │
│ Odd informada  3,90      Odd real  3,71   (−4,9%)    │
│ Margem embutida no bilhete           14,2%           │
│                                                       │
│ ├ Criciúma × Cuiabá      Mais de 0,5 gols     1,08   │
│ │  Série B · 19:30              melhor: 1,10 Betano  │
│ ├ Athletic × Vila Nova   Over 1.5 gols        1,42   │
│ │  Série B · 20:30              melhor: 1,38 Bet365  │
│ └ CRB × América-MG       CRB vence            2,54   │
│    Série B · 21:30        não foi possível conferir  │
│                                                       │
│ Fonte: apostasepalpites.com.br  ·  ver original      │
└──────────────────────────────────────────────────────┘
```

Regras de interface:
- **Crédito e link para a fonte em todo bilhete.** Sempre.
- Perna não conferida aparece como "não foi possível conferir", **nunca** como odd zerada
- Diferença entre odd informada e odd real: verde quando a real é melhor, vermelho quando
  é pior, com o percentual explícito
- Cor nunca sozinha: todo estado tem ícone + palavra (acessibilidade)
- Mobile: prioriza título, odd total, margem e número de pernas; as pernas ficam
  recolhíveis
- Ordenação padrão: fontes com melhor ROI histórico primeiro

**Aba Fontes** — o placar, que é o coração da coisa:

| Fonte | Bilhetes | Green | Red | Win rate | Odd média | ROI | Yield |
|---|---|---|---|---|---|---|---|
| apostasepalpites | 84 | 31 | 53 | 36,9% | 3,84 | +9,2% | +9,2% |
| predictlix | 112 | 44 | 68 | 39,3% | 2,71 | −4,1% | −4,1% |

Use `computePerformance()` de `src/lib/bets/performance.ts`. **Exiba ROI e yield com o
mesmo destaque do win rate**, e mostre o aviso de amostra pequena abaixo de 30 bilhetes
resolvidos — com 12 entradas, qualquer ROI está dentro do ruído.

### 8. Linguagem

Bilhete é **conteúdo de terceiro**, não recomendação do app. O texto tem que deixar isso
claro. Use "publicado por", "segundo a fonte", "probabilidade estimada". Nunca "entrada
certa", "aposta garantida" ou "vai acontecer".

### 9. Testes — acrescentar em `tests/run.ts`

- Conversão de odd fracionária → decimal
- `combinedOddMilli` com 2, 3 e 5 pernas
- `slipMarginBps`: 5 pernas a 5% de margem devem dar ~23%, não 5%
- Liquidação: um red derruba o bilhete; push reduz a odd e mantém vivo
- Dedupe: o mesmo bilhete vindo de duas páginas entra uma vez só
- Parser de cada fonte contra **HTML fixo salvo em arquivo** — nunca contra a rede

---

## RESTRIÇÕES

- **Só fontes públicas e gratuitas.** Nada de conteúdo de grupo pago.
- **Crédito e link em todo bilhete exibido.**
- Respeitar `robots.txt` e limitar a 1 requisição por fonte por dia.
- Nenhuma chave de API no código — variáveis de ambiente, e atualize `.env.example`.
- O app tem que funcionar com **zero fontes disponíveis**: a aba mostra estado vazio
  explicando o que aconteceu, sem erro.

---

## ORDEM DE ENTREGA

1. Migration + repositórios + domínio puro + testes do domínio
2. **Uma** fonte funcionando ponta a ponta (`apostasepalpites` — é a que tem Brasil)
3. A tela, já com o cruzamento de odd real e a margem acumulada
4. As outras 4 fontes (cada uma é um arquivo pequeno e isolado)
5. Liquidação automática + aba Fontes com o placar
6. `npm run lint && npm run typecheck && npm test && npm run build` — corrigir tudo

No fim, me entregue: arquivos criados, arquivos modificados, rotas novas, tabelas novas,
variáveis de ambiente necessárias, como agendar o cron, e como testar cada fonte sem rede.
