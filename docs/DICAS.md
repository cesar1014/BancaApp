# Central de Dicas

Documentação da área **Dicas**: análise de apostas esportivas pré-jogo e ao
vivo com três provedores por trás de uma única camada de dados.

```
API-Football ─┐
Sportmonks   ─┼─▶ Sports Data Layer ─▶ Bet Intelligence Engine ─▶ Central de Dicas
The Odds API ─┘        (cache, quota,       (sinais, score,          (Destaques, Hoje,
                        matching, fallback)  estratégias, estados)    Próximos, Ao vivo,
                                                                      Histórico)
```

> Toda indicação é uma **probabilidade estimada** pelo modelo. O sistema nunca
> apresenta uma dica como certeza e nunca sugere stake: o controle de risco da
> banca continua valendo para qualquer entrada.

---

## 1. Arquitetura

```
src/lib/sports/
  config/
    leagues.ts            catálogo de competições (ids por provedor, prioridade, médias)
    cache-policy.ts       TTL por tipo de dado, modos de economia, cooldowns
    strategy-config.ts    PESOS DO SCORE E LIMIARES DE CADA ESTRATÉGIA (tudo aqui)
  domain/                 100% puro — sem I/O, coberto por testes
    models.ts             NormalizedFixture/Team/League/Statistics/Odds/Event, BetTip
    names.ts              normalização de nomes de times, aliases, similaridade
    matching.ts           casamento de partidas entre provedores
    odds-math.ts          implícita, odd justa, value, EV, margem, melhor cotação
    signals.ts            sinais 0–1 a partir das estatísticas (tolerante a ausência)
    scoring.ts            Entry Score 0–100 com redistribuição de pesos
    poisson.ts            distribuição de Poisson e grade de resultados
    strategies/           um Strategy Module por mercado
    analysis-state.ts     máquina de estados (OBSERVANDO → … → ENTRADA_IDENTIFICADA)
    funnel.ts             score de interesse e níveis do funil
    evaluate.ts           avaliação pura de uma partida (usada em produção e no backtest)
    performance.ts        win rate, ROI, yield, profit factor e recortes
    backtest.ts           "se essa estratégia tivesse rodado nestes jogos…"
  infra/
    http.ts               fetch com timeout, retry/backoff, circuit breaker
    cache.ts              cache memória + persistência, deduplicação de chamadas
    quota.ts              ProviderQuotaManager (headers reais, modos, limite/minuto)
    logger.ts             logs estruturados sem segredos, com supressão de repetição
  providers/
    types.ts              contrato SportsProvider
    mock.ts               simulador determinístico
    api-football.ts       adaptador API-Football
    sportmonks.ts         adaptador Sportmonks
    odds-api.ts           adaptador The Odds API
    index.ts              registro por modo/ambiente
  data-layer.ts           SportsDataLayer: escolhe provedor, casa, mescla, faz fallback

src/lib/repos/sports.ts   partidas, snapshots, odds, mapping, cache e quota (SQL)
src/lib/repos/tips.ts     bet_tips
src/lib/services/sports/
  runtime.ts              monta a camada de dados com as dependências reais
  engine.ts               rotinas (fixtures, live, odds, settle, performance)
  tips.service.ts         modelos de leitura para as páginas
src/app/(app)/dicas/      páginas
src/app/api/workers/sports/route.ts   endpoint do worker
src/components/tips/      interface
```

Regra de dependência: a interface só conhece `tips.service.ts`; o serviço só
conhece repos e o motor; o motor conhece a camada de dados; os provedores nunca
se conhecem entre si e nunca tocam o banco.

## 2. Provedores e papéis

| Provedor | Papel | Plano gratuito | Endpoints usados |
| --- | --- | --- | --- |
| **API-Football** (v3, api-sports.io) | primário: calendário, ao vivo, placar, minuto, eventos, estatísticas, odds (fallback), previsões | 100 req/dia, 10/min, todos os endpoints | `/fixtures?date=`, `/fixtures?live=all`, `/fixtures?ids=` (até 20), `/odds?fixture=`, `/odds/live?fixture=`, `/predictions?fixture=` |
| **Sportmonks** (v3) | enriquecimento de estatísticas em partidas selecionadas | só Superliga (DIN) e Premiership (ESC); xG é add-on pago | `/fixtures/date/{d}`, `/livescores/inplay`, `/fixtures/multi/{ids}` com `include=participants;scores;state;league;periods;statistics;events` |
| **The Odds API** (v4) | odds de várias casas | 500 créditos/mês; custo = mercados × regiões | `/sports/{key}/events` (grátis), `/sports/{key}/odds?eventIds=`, `/sports/{key}/events/{id}/odds` |

Comportamento progressivo:

| Chaves | Resultado |
| --- | --- |
| nenhuma | `mock` — tudo simulado, zero custo |
| só API-Football | calendário, ao vivo, estatísticas e odds da própria API-Football |
| API-Football + Odds API | odds de várias casas com melhor cotação |
| as três | estatísticas enriquecidas nas ligas cobertas pelo Sportmonks |

Recursos que não existem no plano gratuito (xG no Sportmonks, `btts` fora do
endpoint por evento) são detectados pela ausência do dado — nunca viram erro.

## 3. Variáveis de ambiente

```
DATA_PROVIDER_MODE=mock|live
API_FOOTBALL_KEY=
SPORTMONKS_API_KEY=
THE_ODDS_API_KEY=
THE_ODDS_API_REGIONS=eu
WORKER_SECRET=            (mín. 16 caracteres; protege /api/workers/sports)
APP_URL=http://localhost:3000
SPORTS_REFRESH_ON_VIEW=true|false
SPORTS_LOG_DEBUG=true|false
```

As chaves só são lidas no servidor (`providers/index.ts`). Nada é enviado ao
navegador.

## 4. Modo mock

`DATA_PROVIDER_MODE=mock` (padrão). O simulador gera 40 partidas por dia,
distribuídas ao longo das 24 h, nas ligas do catálogo. O minuto de cada jogo é
derivado do relógio real: a qualquer hora há partidas ao vivo, e elas evoluem
de verdade (estatísticas, gols, cartões, odds de três casas). A mesma data
sempre gera os mesmos jogos (semente = data + índice), o que torna tudo
reprodutível.

Para testar:

```bash
npm run db:migrate           # cria as tabelas de dicas (0003_sports.sql)
npm run dev                  # abra /dicas
```

Abrindo qualquer aba de Dicas, o sistema roda as rotinas sob demanda
(`SPORTS_REFRESH_ON_VIEW=true`). Em poucos minutos aparecem partidas ao vivo
evoluindo, oportunidades e, ao fim dos jogos, dicas liquidadas no Histórico.
Em Configurações, o administrador vê o painel de provedores e pode disparar
"Atualizar agora".

## 5. Modo live

1. Crie as chaves nos provedores e preencha o `.env`.
2. `DATA_PROVIDER_MODE=live`.
3. Configure um cron chamando o worker (recomendado), por exemplo a cada minuto:

```bash
curl -X POST "https://SEU-APP/api/workers/sports?job=all" -H "Authorization: Bearer $WORKER_SECRET"
```

Ou rode o worker local durante o desenvolvimento:

```bash
npm run sports:worker              # loop a cada 60 s
npm run sports:worker -- --once    # uma rodada
npm run sports:worker -- --job=live
```

Chamar o worker com frequência **não** gasta quota extra: cada rotina tem um
cooldown persistido (`sports_jobs`) e só consulta um provedor quando o cache
venceu.

Rotinas:

| Rotina | Cooldown | O que faz | Chamadas típicas |
| --- | --- | --- | --- |
| `fixtures` | 15 min | calendário de hoje + 2 dias; funil inicial | 3 (API-Football) |
| `live` | 45 s | lista ao vivo → funil → detalhe em lote → odds → avaliação → snapshots → dicas | 1 + ⌈monitoradas/20⌉ + odds só das avançadas |
| `odds` | 60 s | odds pré-jogo das partidas que começam em 3 h | ≤ maxMonitored |
| `settle` | 5 min | liquida dicas de partidas encerradas | 0–1 |
| `performance` | 10 min | métricas (cálculo puro, sem chamadas) | 0 |

## 6. Cache

`config/cache-policy.ts`:

| Dado | TTL |
| --- | --- |
| ligas, times | 7 dias |
| partidas futuras | 6 h |
| partidas de hoje | 15 min |
| lista ao vivo | 45 s |
| estatísticas ao vivo (lote por ids) | 40 s |
| odds pré-jogo | 20 min |
| odds ao vivo | 60 s |
| previsões | 12 h |
| índice de eventos da Odds API (grátis) | 30 min |

Duas camadas: memória (por instância) e tabela `sports_cache` (sobrevive ao
cold start do serverless). Chamadas simultâneas pela mesma chave compartilham
uma única requisição. Dado vencido fica disponível como fallback marcado
`stale` quando o provedor falha — e a interface avisa "pode estar
desatualizado".

## 7. Quota e modo economia

`ProviderQuotaManager` lê o restante dos headers reais
(`x-ratelimit-requests-remaining`, `rate_limit.remaining`,
`x-requests-remaining`) e conta localmente quando não há header. Estado
persistido em `provider_usage`.

| Modo | Quando | Efeito |
| --- | --- | --- |
| NORMAL | > 35% restante | TTLs normais; funil 20/8/4 |
| ECONOMIA | ≤ 35% | TTL ×3; funil pela metade; chamadas de baixa prioridade adiadas |
| CRÍTICO | ≤ 12% | TTL ×10; funil ¼; só partidas com estado avançado consultam |
| EXAURIDO | 0 | nenhuma chamada até o reset |

Prioridade de atualização: entrada identificada → quase entrando →
monitoradas → demais. O limite por minuto da API-Football (10/min) também é
respeitado.

## 8. Matching entre provedores

`domain/names.ts` + `domain/matching.ts`:

1. normalização agressiva do nome (minúsculas, sem acento/`ø`, remove FC/SC/SE/CR…, expande Utd/Ath/Atl…);
2. aliases conhecidos (Man Utd = Manchester United = Manchester Utd; Atlético-MG = Atletico Mineiro) + aliases persistidos em `sport_teams.aliases`;
3. similaridade de Dice sobre bigramas + bônus de prefixo/token principal;
4. janela de ±90 min no horário e competição quando ambos informam;
5. mandante **e** visitante precisam passar do limiar; se dois candidatos empatam, o resultado é AMBIGUOUS e nada é casado (melhor sem odd do que com a odd de outro jogo).

O casamento é gravado em `provider_mapping` e reaproveitado. A chave interna
da partida é `data:mandante:visitante` canônicos.

## 9. Algoritmo

**Sinais** (`signals.ts`): índices 0–1 por time (ataques perigosos, chutes,
no alvo, escanteios, xG por minuto, posse), pressão geral, dominância (−1…+1),
momentum (ritmo recente × ritmo médio), projeções por 90'. Dado ausente = `null`.

**Modelo de gols** (`strategies/goal-model.ts`): gols restantes ~ Poisson(λ),
λ = taxa × minutos restantes × multiplicador de pressão. A taxa começa na média
da liga e se mistura com o xG observado (ou um proxy por finalizações quando
não há xG). Sem estatística nenhuma, é só a média da liga.

**Score** (`scoring.ts`): pesos padrão pressão 25, xG 20, finalizações 15,
contexto 15, valor da odd 20, outros 5. Componentes ausentes têm o peso
redistribuído proporcionalmente — a nota nunca cai por falta de dado.

**Value** (`odds-math.ts`): `implícita = 1/odd`, `odd justa = 1/p`,
`EV = p×odd − 1`, `value = odd/odd_justa − 1`. Só há dica com EV positivo acima
do mínimo da estratégia e odd dentro da faixa.

**Estados** (`analysis-state.ts`):
`OBSERVANDO → MONITORANDO → PRESSÃO DETECTADA → POSSÍVEL OPORTUNIDADE →
ODD AGUARDANDO → VALUE CONFIRMADO → ENTRADA IDENTIFICADA`, `DESCARTADA` ao
piorar (com histerese) e `ENCERRADA` ao fim.

## 10. Estratégias

| Chave | Mercado | Escopo |
| --- | --- | --- |
| `LIVE_OVER_0_5` | Over 0.5 gols | ao vivo (20'–80') |
| `LIVE_OVER_1_5` | Over 1.5 gols | ao vivo (15'–75') |
| `OVER_2_5` | Over 2.5 gols | pré e ao vivo |
| `UNDER_2_5` | Under 2.5 gols | pré e ao vivo |
| `BTTS` | Ambas marcam | pré e ao vivo |
| `LIVE_NEXT_GOAL` | Próximo gol | ao vivo, só lado dominante |
| `MATCH_WINNER` | Resultado | pré e ao vivo |
| `DOUBLE_CHANCE` | Dupla chance | pré e ao vivo |
| `LIVE_CORNERS` | Escanteios | ao vivo |
| `LIVE_CARDS` | Cartões | ao vivo |

Todos os limiares (`minScore`, `minValueBps`, `minOddMilli`, `maxOddMilli`,
`minMinute`, `maxMinute`, `minShots`, `minShotsOnTarget`, `minXgMilli`,
`minProbabilityBps`…) ficam em `config/strategy-config.ts`. A tabela
`bet_strategies` pode sobrescrever `thresholds`, `weights`, `params` e
`is_enabled` em runtime.

## 11. Como adicionar um provedor

1. Crie `providers/<nome>.ts` implementando `SportsProvider` (devolva só modelos normalizados; `null`/`[]` quando o recurso não existe).
2. Adicione o `ProviderKey` em `domain/models.ts` e o limite em `infra/quota.ts` (`DEFAULT_QUOTA_LIMITS`).
3. Registre em `providers/index.ts` com o papel (primário, enriquecimento ou odds).
4. Inclua os ids das ligas em `config/leagues.ts`.
5. Escreva um teste com `fetchJson` falso em `tests/sports.ts`.

## 12. Como adicionar um mercado

1. Adicione a `MarketKey` (e rótulo) em `domain/models.ts`.
2. Crie o módulo em `domain/strategies/` implementando `estimate()` e `settle()`.
3. Registre em `domain/strategies/index.ts`.
4. Adicione a configuração em `config/strategy-config.ts`.
5. Ensine os adaptadores a mapear as cotações do mercado (`parseBet` no API-Football, `parseOutcome` na Odds API).
6. Teste estimativa e liquidação em `tests/sports.ts`.

## 13. Banco de dados

Migration `db/migrations/0003_sports.sql`:

| Tabela | Papel |
| --- | --- |
| `sport_leagues`, `sport_teams` | catálogo visto + aliases persistidos |
| `sport_fixtures` | partida normalizada (`payload` JSONB) + estado da análise, funil, score |
| `provider_mapping` | id do provedor ↔ entidade interna, com confiança |
| `live_snapshots` | fotografia a cada 5' (máx. 24 por partida) |
| `odds_snapshots` | histórico de cotações (movimento da odd) |
| `bet_strategies` | sobrescritas de configuração |
| `bet_tips` | dicas com contexto do momento, resultado, lucro e vínculo opcional à entrada real |
| `provider_usage` | quota por provedor |
| `sports_cache` | cache persistente |
| `sports_jobs` | última execução/cooldown das rotinas |

## 14. Backtesting

`domain/backtest.ts` roda `evaluateFixture` sobre snapshots históricos
(`live_snapshots` + `odds_snapshots`), gera as dicas que teriam sido dadas e
liquida com o resultado final. O relatório traz as mesmas métricas do
Histórico. Falta apenas o carregador de snapshots do banco para o relatório
(planejado); a lógica já é testada.

## 15. Logs

Eventos: `provider.failure`, `provider.quota`, `provider.circuit`,
`matching.linked`, `matching.ambiguous`, `tip.created`, `tip.discarded`,
`tip.settled`, `score.changed`, `odds.error`, `worker.run`, `worker.skip`.
Repetições do mesmo evento são suprimidas por 30 s; chaves são mascaradas.
