# Bilhetes

Aba que mostra, automaticamente, múltiplas ("bilhetes prontos") publicadas por
fontes públicas — brasileiras e internacionais — e faz três coisas que as
fontes não fazem:

1. **Confere a odd real.** Cada perna é casada com a partida em `sport_fixtures`
   e comparada com as cotações guardadas pelo módulo de Dicas (The Odds API,
   API-Football ou simulação). A melhor odd por perna aparece ao lado da
   informada, com a diferença em percentual.
2. **Mostra a margem acumulada.** A margem de cada perna vem do livro devigado
   da mesma casa; a do bilhete é `∏(1 + m_i) − 1`. Cinco pernas a 5% dão 27,6%.
3. **Mantém o placar de cada fonte.** Todo bilhete é liquidado com stake de
   referência e o ROI, yield, profit factor e win rate acumulam por fonte.

> Bilhete é conteúdo de terceiro. A interface diz "publicado por" e "segundo a
> fonte", traz crédito e link em todo cartão e nunca chama nada de certo.

---

## Arquitetura

```
src/lib/bilhetes/
  domain/                 puro, testável sem banco e sem rede
    types.ts              RawSlip, RawLeg, SlipSource, Slip, SlipLeg
    odds.ts               "1,40" / "8/13" / "EVS" → milli
    dates.ts              Hoje/Amanhã/Today, 05/09, 16h05, fuso da fonte → ISO
    markets.ts            texto do mercado (PT/EN) → MarketKey/Selection/linha
    leagues.ts            nome da competição → chave do catálogo (com país)
    html.ts               extração mínima de HTML server-side (sem dependência)
    slip.ts               odd combinada, margem, melhor odd, comparação, liquidação, dedupe
  sources/                um arquivo por fonte, isolados
    fetch-page.ts         robots.txt + User-Agent + timeout; nunca lança
    apostasepalpites.ts   aposta10.ts   predictlix.ts   mightytips.ts   apwin.ts
    index.ts              registro
  matching.ts             perna → sport_fixtures (reaproveita matchFixture)
src/lib/repos/bilhetes.ts             SQL
src/lib/services/bilhetes.service.ts  coleta, conferência, liquidação, placar, leitura
src/app/api/workers/bilhetes/route.ts worker (cron)
src/actions/bilhetes.ts               coleta manual, ligar/desligar fonte, conferência manual
src/app/(app)/bilhetes/               Hoje · Próximos · Histórico · Fontes
src/components/bilhetes/              cartão, placar, filtros
tests/bilhetes.ts + tests/fixtures/bilhetes/*.html
```

Nomes citados no briefing e onde estão de fato neste projeto:

| Briefing | Aqui |
| --- | --- |
| `src/lib/sports/names.ts` `canonicalize()`/`similarity()` | `src/lib/sports/domain/names.ts` `teamKey()`/`teamSimilarity()` |
| `src/lib/sports/matching.ts` `findMatch()` | `src/lib/sports/domain/matching.ts` `matchFixture()` |
| `src/lib/bets/math.ts` `removeMarginBps` | `src/lib/sports/domain/odds-math.ts` `removeMargin` |
| `src/lib/bets/performance.ts` `computePerformance()` | `src/lib/sports/domain/performance.ts` |
| `src/lib/bets/settlement.ts` `settleTip()` | `settle()` de cada Strategy Module em `src/lib/sports/domain/strategies/` |
| `sport_fixtures(key)` | `sport_fixtures(id)` (id determinístico `data:mandante:visitante`) |
| `/api/dicas/refresh` + `TIPS_WORKER_SECRET` | `/api/workers/bilhetes` (aceita `TIPS_WORKER_SECRET` ou `WORKER_SECRET`) |

## Fontes (conferidas em 05/09/2026)

| Fonte | País | Como é lida | Odd por perna | Observações |
| --- | --- | --- | --- | --- |
| apostasepalpites.com.br/palpites/ | BR | HTML Nuxt: `<h2>… @ 3.10</h2>`, `data-testid="selection-title"`, `<time datetime>` | sim, no texto ("está com odds 1,40") | não arquiva; 12 bilhetes/dia; competição inferida do texto |
| aposta10.com/blog/bilhetes-prontos-nos-jogos-de-hoje-DDMMAAAA | BR | HTML RSC, seleções em texto livre | não | 3 bilhetes/dia; a página só existe depois de publicada (sem página = "sem dados hoje") |
| predictlix.com/accumulator-tips/ | INT | `acca-card` / `acca-sel-*` | sim | 18 bilhetes em 6 blocos; recicla jogos (dedupe) |
| mightytips.com/…/accumulator/ | INT | `mtl-accumulator-list__*` + Mega Acca | sim | data absoluta no bilhete |
| apwin.com/accumulator-predictions/ | INT | abas `x-show="tabs === n"`, data e liga no link | sim | hoje/amanhã/depois |

Todas checam `robots.txt` antes de cada requisição, enviam `User-Agent`
identificando o app e ficam limitadas pelo cooldown (`BILHETES_SOURCE_COOLDOWN_HOURS`,
padrão 6 h → no máximo duas coletas por dia por fonte).

Descartadas após teste (não perca tempo): goalsnow, accuratetip, footballpredictions.net,
gazetaesportiva, clubedaposta, netflu, winningarena, windrawwin. Com ressalva:
thestatbible (paywall corta pernas) e tiporacle (dados possivelmente sintéticos).

## Fluxo

```
cron → /api/workers/bilhetes?job=all
  collect  cada fonte isolada: fetchSlips → dedupe → INSERT (ON CONFLICT ignora)
  verify   casa perna ↔ sport_fixtures → melhor odd real → margem → comparação
  settle   partida FINISHED → settle() da estratégia → bilhete green/red/push
```

- Perna sem casamento seguro fica "não foi possível conferir"; o bilhete vira
  "conferência parcial". Nunca se inventa casamento.
- Mercados sem equivalente (gol do time, jogador, handicap asiático) não são
  conferidos nem liquidados automaticamente: se a partida acabou, o bilhete vai
  para **conferência manual** (`PENDING`) e o administrador decide a perna
  com os botões Green/Red/Push no cartão.
- Um red derruba o bilhete; push tira a perna da conta; green só quando todas
  as pernas decidiram.

## Tabelas (`db/migrations/0004_bilhetes.sql`)

| Tabela | Papel |
| --- | --- |
| `tip_sources` | fontes (slug, nome, URL, país, ativa, notas) — as 5 iniciais já entram |
| `tip_slips` | bilhete: odd informada, computada, real, margem, verificação, status, resultado, dinheiro; `UNIQUE (source_slug, reference_date, dedupe_hash)`; `CHECK` de coerência |
| `tip_slip_legs` | perna: jogo, competição, horário, mercado, seleção, odd informada (nullable), odd real, casa, margem, `fixture_id` → `sport_fixtures(id) ON DELETE SET NULL`, resultado |
| `tip_source_runs` | log de cada coleta (início, fim, status, encontrados, novos, erro) |

## Variáveis de ambiente

```
TIPS_WORKER_SECRET=              (opcional; senão WORKER_SECRET)
BILHETES_SOURCES=                (vazio = todas as ativas)
BILHETES_SOURCE_COOLDOWN_HOURS=6
BILHETES_USER_AGENT=BancaBilhetes/1.0 (+contato)
```

Nenhuma chave de API é necessária para as fontes (são páginas públicas). A
conferência de odd usa as cotações que o módulo de Dicas já mantém.

## Agendar o cron

Dois horários no fuso da banca (08:00 e 14:00 pegam o que sai de manhã e à
tarde) para coletar, e uma vez por hora para liquidar:

```
0 11,17 * * *  curl -s -X POST "https://SEU-APP/api/workers/bilhetes?job=collect" -H "Authorization: Bearer $TIPS_WORKER_SECRET"
15 * * * *     curl -s -X POST "https://SEU-APP/api/workers/bilhetes?job=settle"  -H "Authorization: Bearer $TIPS_WORKER_SECRET"
```

(11 e 17 UTC = 08 e 14 em Brasília.) Serve Vercel Cron, GitHub Actions ou
cron-job.org. `?force=1` ignora o cooldown; `job=verify` só reconfere odds.

## Testar cada fonte sem rede

```bash
npm test
```

`tests/bilhetes.ts` roda os cinco parsers contra `tests/fixtures/bilhetes/*.html`
(baixados em 05/09/2026) e confere contagens, odds, datas, horários e ligas.
Para atualizar um fixture depois de uma mudança no site:

```bash
curl -sL -A "BancaBilhetes/1.0" -o tests/fixtures/bilhetes/predictlix.html https://predictlix.com/accumulator-tips/
```

Para ver o que um parser extrai de um HTML qualquer:

```ts
import { parsePredictlix } from './src/lib/bilhetes/sources/predictlix';
console.log(parsePredictlix(readFileSync('pagina.html', 'utf8'), new Date()));
```

## Adicionar uma fonte

1. Baixe a página e confira (DevTools → Network) se existe JSON interno; se
   houver, prefira-o ao HTML.
2. Crie `sources/<slug>.ts` exportando `parse<Nome>(html, now)` puro e um
   `SlipSource`.
3. Registre em `sources/index.ts` e insira a linha em `tip_sources` (migration
   nova ou `INSERT`).
4. Salve o HTML em `tests/fixtures/bilhetes/` e escreva o teste.
