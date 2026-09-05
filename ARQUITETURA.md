# Arquitetura

Documento de referência do sistema de gestão de banca esportiva compartilhada.
Descreve as decisões tomadas antes da implementação: stack, estrutura, modelo
de dados, regras de cálculo, fluxos e permissões.

---

## 1. Stack e por quê

| Camada | Escolha | Motivo |
| --- | --- | --- |
| Framework | **Next.js 15 (App Router)** | Server Components + Server Actions permitem que todo cálculo e toda autorização aconteçam no servidor, sem API intermediária. Roda nativamente na Vercel. |
| Linguagem | **TypeScript estrito** | `strict: true`, sem `any` no domínio. |
| Estilo | **Tailwind CSS 3** | Design system em tokens CSS + utilitários; sem CSS-in-JS em runtime. |
| Banco | **PostgreSQL** via `pg` | Tipos exatos (`BIGINT`, `DATE`), `CHECK` constraints reais e SQL explícito. Compatível com Neon, Supabase, Vercel Postgres, Railway ou Postgres local. |
| Migrations | **SQL puro** + runner próprio (`scripts/migrate.ts`) | O schema é legível e versionado como SQL, sem camada de tradução. |
| Autenticação | **scrypt** (`node:crypto`) + **JWT HS256** (Web Crypto) em cookie `httpOnly` | Zero dependência externa; o mesmo código valida a sessão no middleware (Edge) e nos Server Components (Node). |
| Validação | **Zod** | Um schema por formulário, validado no servidor. |
| Gráficos | **SVG escrito à mão** | Controle total do visual, sem peso de biblioteca, e a geometria é testável. |
| Ícones | **SVG inline** | Traço e grade consistentes, sem dependência. |
| Testes | **`node:assert` + runner próprio** (`tests/run.ts`) e **`tests/integration.sql`** | Cobrem o domínio (cálculos) e o schema (constraints e agregações). |

### O que deliberadamente **não** foi usado
- **ORM**: as consultas do sistema são agregações financeiras; SQL direto é mais
  claro e mais fácil de auditar do que um query builder.
- **Biblioteca de gráficos**: os dois gráficos necessários são simples e o
  resultado fica mais leve e mais coerente com o restante da interface.
- **Biblioteca de datas**: `Intl` + aritmética em UTC resolvem tudo o que o
  sistema precisa (ver §5).

---

## 2. Precisão numérica

Dinheiro **nunca** é representado por ponto flutuante.

| Grandeza | Representação | Exemplo |
| --- | --- | --- |
| Valores monetários | inteiro de **centavos** (`BIGINT` / `number`) | R$ 50,00 → `5000` |
| Odds | inteiro **× 1000** | 2,15 → `2150` |
| Percentuais | **basis points** (× 100) | 1% → `100`; 25% → `2500` |

`Number` suporta com segurança até 2^53 centavos (≈ R$ 90 trilhões), muito além
de qualquer banca. Dois parsers de tipo são registrados no driver (`src/lib/db.ts`):

- `int8` → `Number` (senão o driver devolveria string);
- `date` → mantém `'AAAA-MM-DD'` (senão o driver devolveria um `Date` no fuso
  local, deslocando o dia).

---

## 3. Estrutura de pastas

```
db/migrations/           SQL versionado (0001_init.sql, ...)
scripts/                 migrate, seed, reset (executáveis via npm)
tests/                   run.ts (domínio) e integration.sql (schema)
src/
  app/
    login/               página pública
    (app)/               área autenticada (layout com sidebar)
      dashboard/ entradas/ metas/ historico/ socios/
      movimentacoes/ estatisticas/ fechamento/ configuracoes/ auditoria/
    api/health/          verificação de saúde
  actions/               Server Actions ('use server') — entrada do mundo externo
  components/
    ui/                  primitivos (botão, card, campo, modal, toast, ...)
    charts/              gráficos SVG
    layout/              sidebar, cabeçalho, seletor de mês
    entries/ members/ transactions/ settings/ closing/ goals/ history/
  lib/
    domain/              REGRAS DE NEGÓCIO PURAS (sem I/O, 100% testáveis)
    repos/               acesso ao banco (SQL)
    services/            orquestração: permissão + regra + persistência + auditoria
    auth/                senha, token, sessão, permissões
    validation/          schemas Zod
    money.ts numbers.ts datetime.ts errors.ts period.ts cn.ts db.ts env.ts audit.ts
  middleware.ts          primeira barreira de autenticação
```

### Regra de dependência

```
app (páginas)  →  services  →  repos  →  db
actions        →  services  →  domain
                     ↓
                  domain  (não importa nada de I/O)
```

`src/lib/domain/**` não conhece banco, HTTP nem React. É por isso que a suíte de
testes roda sem subir nada.

---

## 4. Modelo de dados

```
users ──┬─< members >── bankrolls ──┬── settings (1:1)
        │      │                    ├──< entries
        │      ├──────────────────< │
        │      └──────────────────< ├──< transactions
        │                           ├──< monthly_goals
        │                           ├──< monthly_closings ──< monthly_closing_partners
        └─────────────────────────< └──< audit_logs
```

| Tabela | Papel |
| --- | --- |
| `users` | contas de login (nome, e-mail único, hash scrypt, perfil, `token_version`) |
| `bankrolls` | a banca (nome, fuso horário, moeda) — o desenho é multi-banca |
| `settings` | **todos** os parâmetros configuráveis (1:1 com a banca) |
| `members` | sócios; opcionalmente vinculados a um `user` |
| `entries` | apostas: data, hora, responsável, esporte, evento, mercado, odd, stake, status, retorno, lucro |
| `transactions` | aportes e retiradas |
| `monthly_goals` | meta específica de um mês (sobrepõe `settings` naquele mês) |
| `monthly_closings` | fotografia imutável do mês fechado (+ `snapshot` JSONB) |
| `monthly_closing_partners` | resultado de cada sócio no mês fechado |
| `audit_logs` | quem, o quê, quando, valor anterior e valor novo |

### Integridade garantida pelo banco

- `entries_result_consistency`: um `CHECK` que replica exatamente as regras de
  lucro por status. Mesmo que alguém escreva direto no banco, um `RED` com lucro
  positivo é recusado.
- `odd_milli > 1000`, `stake_cents > 0`, `amount_cents > 0`.
- e-mail único ignorando maiúsculas e espaços;
- um usuário não pode ser dois sócios da mesma banca;
- sócio com entradas **não pode** ser apagado (`ON DELETE RESTRICT`) — o
  histórico é preservado; a saída se dá desativando o sócio;
- fechamento único por `(banca, ano, mês)`.

---

## 5. Datas e fuso horário

Datas de negócio são `DATE` no banco e strings `'AAAA-MM-DD'` no código. Toda
aritmética usa UTC internamente (nunca sofre deslocamento); o fuso da banca
(`bankrolls.timezone`, padrão `America/Sao_Paulo`) é usado apenas para responder
"que dia é hoje?". A semana dos stops é a semana ISO: **segunda a domingo**.

---

## 6. Regras de cálculo

### 6.1 Resultado de uma entrada (`src/lib/domain/entry.ts`)

| Status | Lucro | Retorno |
| --- | --- | --- |
| Aberta | 0 | 0 |
| **Green** | `stake × (odd − 1)` | `stake + lucro` |
| **Red** | `− stake` | 0 |
| **Void** | 0 | `stake` (devolvida) |
| **Cashout** | `retorno − stake` | informado pelo usuário |

Arredondamento em centavos, meio para cima. O lucro **nunca** vem do cliente: é
recalculado no servidor a cada gravação e conferido pelo `CHECK` do banco.

### 6.2 Banca

```
banca = banca inicial + lucro realizado + aportes − retiradas
```

Entradas **em aberto não movimentam a banca** (aparecem como "exposição em
aberto"). Aporte nunca é lucro; retirada nunca é prejuízo — são somados por um
caminho separado em todas as agregações.

### 6.3 ROI e taxa de acerto

- **Total apostado** = soma das stakes de entradas resolvidas *exceto Void*
  (a stake do Void foi devolvida integralmente).
- **ROI** = lucro ÷ total apostado. É `null` (exibido como "—") quando nada foi
  arriscado — nunca "0%".
- **Taxa de acerto** = greens ÷ (greens + reds). Voids e cashouts são exibidos
  separadamente, para não distorcer o número.

### 6.4 Metas

- Meta diária (modo automático) = meta mensal ÷ dias ativos.
- Meta acumulada no dia *N* = `min(meta diária × N, meta mensal)`.
- Banca-alvo no dia *N* = banca no início do mês + meta acumulada.
- Banca real no dia *N* = inclui aportes e retiradas do período.
- Status do dia, nesta ordem de prioridade:
  `STOP ATINGIDO` → `SEM ENTRADAS` → `META BATIDA` → `ACIMA DA META` → `ABAIXO DA META`
  (dias futuros ficam como `A REALIZAR`).

Nenhum cálculo assume que a meta será atingida. Não há obrigação de lucro diário.

### 6.5 Risco

- **Stake máxima** = `base × risco por entrada`, onde a base é configurável
  (banca atual, banca no início do mês ou banca inicial). Um teto absoluto
  opcional prevalece quando é menor.
- **Stops** diário, semanal e mensal em percentual da mesma base.
- Política por limite: **bloquear** ou **apenas alertar**.
- Somente o administrador pode autorizar uma entrada acima do limite, e a
  exceção exige motivo, marca a entrada e gera registro de auditoria.

> Três invariantes desta camada: limites **nunca** aumentam sozinhos; o sistema
> **nunca** sugere aumentar stake para recuperar prejuízo; um limite atingido
> sempre produz bloqueio ou alerta explícito — jamais silêncio.

### 6.6 Sócios

- `saldo teórico = aporte inicial + aportes − retiradas + fatia do lucro`
- A fatia do lucro é rateada pelas participações com **método do maior resto**:
  a soma das fatias é exatamente igual ao lucro, sem centavo perdido ou criado.
- A soma das participações precisa dar 100%; caso contrário o sistema avisa em
  todas as telas relevantes (e continua rateando proporcionalmente).
- Movimentações sem sócio vinculado entram na banca mas não no saldo de ninguém,
  e isso é exibido explicitamente.

### 6.7 Fechamento mensal

O fechamento grava um `snapshot` JSONB com todos os números do mês, incluindo o
resultado de cada sócio. Depois disso:

- o período **não aceita** novas entradas, edições ou movimentações;
- alterações futuras em configurações **não** reescrevem o passado — as páginas
  de histórico leem o snapshot, nunca um recálculo;
- o administrador pode reabrir o mês (ação auditada), o que descarta o snapshot.

---

## 7. Autenticação e permissões

1. **Login**: e-mail + senha, hash scrypt, mensagem única para e-mail
   inexistente e senha errada (não revela quem existe).
2. **Sessão**: JWT HS256 assinado com `AUTH_SECRET`, em cookie `httpOnly`,
   `sameSite=lax`, `secure` em produção.
3. **Middleware**: valida a assinatura antes de renderizar qualquer rota privada.
4. **Servidor**: `getSessionUser()` revalida **sempre** contra o banco — usuário
   ativo e `token_version` compatível. Trocar a senha ou desativar a conta
   invalida imediatamente todas as sessões abertas.

Há três níveis: **dono** (uma única conta, `users.is_owner`), **administrador**
e **sócio**. O login é por nick (`users.username`) ou e-mail. Contas novas
nascem com a senha padrão e `must_change_password = TRUE`; `requireUser()`
redireciona para `/trocar-senha` até a troca. "Esqueci a senha" exige nick +
senha padrão; o administrador pode restaurar a senha padrão de qualquer conta.

| Ação | Dono | Administrador | Sócio |
| --- | :---: | :---: | :---: |
| Ver dashboard, metas, histórico, estatísticas, sócios, auditoria, dicas | ✅ | ✅ | ✅ |
| Registrar entradas | ✅ | ✅ (em qualquer nome) | ✅ (só no próprio nome, se habilitado) |
| Editar / excluir entradas | ✅ | ✅ (qualquer uma) | ✅ (apenas as próprias) |
| Autorizar entrada acima do limite | ✅ | ✅ | ❌ |
| Aportes e retiradas | ✅ | ✅ | ❌ (somente leitura) |
| Sócios, participações e usuários | ✅ | ✅ | ❌ (somente leitura) |
| Configurações de risco, identificação e permissões | ✅ | ✅ | ❌ |
| **Banca inicial, meta mensal, banca-alvo e metas do mês** | ✅ | ❌ | ❌ |
| Fechar / reabrir mês | ✅ | ✅ | ❌ |
| Atualização manual e painel de provedores das dicas | ✅ | ✅ | ❌ |

A interface esconde o que a pessoa não pode fazer, mas **quem decide é o
servidor**: toda Server Action revalida a permissão antes de escrever.

---

## 8. Fluxo de uma entrada (ponta a ponta)

```
Formulário (cliente)
  └─ envia texto puro: data, stake "50,00", odd "2,15", status
       ↓
Server Action  createEntryAction
  ├─ requireUserForAction()          sessão válida?
  ├─ Zod                             formato dos campos
  ├─ canCreateEntry()                permissão
  ├─ assertPeriodOpen()              o mês está fechado?
  ├─ evaluateEntryRisk()             stake × limite, stops do dia/semana/mês
  │    └─ BLOCK → erro explicado ao usuário, nada é gravado
  ├─ computeEntryResult()            LUCRO CALCULADO AQUI (nunca vem do cliente)
  ├─ INSERT  (CHECK do banco confere o lucro de novo)
  ├─ recordAudit()
  └─ revalidatePath() nas páginas afetadas
```

---

## 9. Auditoria

Toda ação que mexe em dinheiro, configuração ou permissão grava: usuário, ação,
entidade, data/hora, descrição legível e o par **valor anterior / valor novo**.
Uma falha ao gravar o log é reportada no servidor, mas nunca derruba a operação
do usuário.

---

## 10. Central de Dicas

Área de análise de apostas (pré-jogo e ao vivo) alimentada por três provedores
(API-Football, Sportmonks, The Odds API) por trás de uma única camada de dados,
com cache, quota, matching entre APIs, motor de score e histórico de
performance. Vive em `src/lib/sports/` (domínio puro + provedores),
`src/lib/repos/{sports,tips}.ts`, `src/lib/services/sports/` e
`src/app/(app)/dicas/`. Migration `0003_sports.sql`. Documentação completa em
[`docs/DICAS.md`](./docs/DICAS.md).

## 11. Bilhetes

Aba que coleta múltiplas publicadas por fontes públicas (cinco adaptadores
isolados em `src/lib/bilhetes/sources/`), casa cada perna com `sport_fixtures`,
confere a odd real com as cotações do módulo de Dicas, calcula a margem
acumulada e liquida o bilhete para manter o placar por fonte. Migration
`0004_bilhetes.sql`; worker em `/api/workers/bilhetes`. Documentação em
[`docs/BILHETES.md`](./docs/BILHETES.md).

---

## 12. Testes

| Suíte | Comando | O que cobre |
| --- | --- | --- |
| Domínio + Dicas + Bilhetes (128 casos) | `npm test` | dinheiro, odds, datas, resultado por status, banca, ROI, metas, série diária, stops, rateio entre sócios, fechamento, senha e token; normalização e matching de partidas, odd justa/implícita/value/EV, score, Poisson, sinais, estratégias e liquidação, estados, funil, cache e deduplicação, quota e modos, circuit breaker, provedores com `fetch` falso, fallback, performance e backtest |
| Schema | `psql "$DATABASE_URL" -f tests/integration.sql` | constraints, agregações, isolamento entre bancas, unicidade, bloqueio de período fechado |

Os testes do domínio não precisam de banco: rodam em segundos e são a rede de
segurança para qualquer mudança nas regras de cálculo.
