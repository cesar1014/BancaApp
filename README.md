# Banca — gestão de banca esportiva compartilhada

Sistema web completo para administrar uma banca esportiva dividida entre sócios:
registro de entradas, controle de risco, metas diárias e mensais, participação
de cada integrante, fechamento mensal e trilha de auditoria.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · PostgreSQL
**Deploy:** Vercel + qualquer Postgres gerenciado (Neon, Supabase, Vercel Postgres…)

> A meta mensal é uma **referência de gestão**. O sistema nunca trata lucro como
> garantido, nunca aumenta limites sozinho e nunca sugere aumentar stake para
> recuperar prejuízo.

---

## 1. Rodar na sua máquina

Pré-requisitos: **Node.js 20 ou superior** e uma URL de PostgreSQL.

```bash
# 1. Instalar dependências
npm install

# 2. Configurar o ambiente
cp .env.example .env       # no Windows (PowerShell): copy .env.example .env
#   edite .env e preencha DATABASE_URL e AUTH_SECRET

# 3. Criar as tabelas e os dados iniciais
npm run db:migrate
npm run db:seed            # use  npm run db:seed -- --demo  para dados de exemplo

# 4. Subir o sistema
npm run dev
```

Abra <http://localhost:3000> e entre com um dos nicks criados pelo seed —
`cesar1014` (dono da banca), `ryang` ou `lucastqa` — e a senha padrão
`FZN2026` (`DEFAULT_USER_PASSWORD`). **No primeiro acesso o sistema exige a
troca da senha.** Quem esquecer a senha usa "Esqueci minha senha" (nick +
senha padrão); se a senha já foi trocada, um administrador restaura a padrão
em Sócios → Usuários.

Somente o dono altera a banca inicial, a meta mensal, a banca-alvo e as metas
de cada mês. Os demais administradores editam o resto.

A área **Dicas** (análise pré-jogo e ao vivo) funciona sem nenhuma API externa
em `DATA_PROVIDER_MODE=mock`. Veja [`docs/DICAS.md`](./docs/DICAS.md).
A área **Bilhetes** coleta múltiplas de fontes públicas via worker agendado;
veja [`docs/BILHETES.md`](./docs/BILHETES.md).

### Gerando o `AUTH_SECRET`

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Se você ainda não tem um PostgreSQL

O caminho mais rápido é criar um banco gratuito no [Neon](https://neon.tech) ou
no [Supabase](https://supabase.com) e copiar a connection string para
`DATABASE_URL` — funciona igual em desenvolvimento e em produção. Com Docker
local, também serve:

```bash
docker run --name banca-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=banca -p 5432:5432 -d postgres:16
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/banca"
```

---

## 2. Deploy na Vercel

1. **Banco**: crie um Postgres gerenciado (Neon, Supabase ou Vercel Postgres) e
   copie a connection string. Se ela exigir SSL, mantenha o `?sslmode=require`.
2. **Repositório**: suba este projeto para o GitHub e importe-o na Vercel.
3. **Variáveis de ambiente** (Project → Settings → Environment Variables):

   | Nome | Valor |
   | --- | --- |
   | `DATABASE_URL` | connection string do Postgres (use a versão *pooled*) |
   | `AUTH_SECRET` | chave aleatória longa (gere com o comando acima) |
   | `SESSION_TTL_HOURS` | opcional, padrão `168` (7 dias) |
   | `DEFAULT_USER_PASSWORD` | senha padrão das contas (padrão `FZN2026`) |
   | `DATA_PROVIDER_MODE` | `mock` (padrão) ou `live` |
   | `API_FOOTBALL_KEY`, `SPORTMONKS_API_KEY`, `THE_ODDS_API_KEY` | chaves dos provedores (só em `live`) |
   | `WORKER_SECRET` | segredo do worker das dicas (mín. 16 caracteres) |

4. **Migrations e seed**: rode uma única vez, da sua máquina, apontando para o
   banco de produção:

   ```bash
   DATABASE_URL="<url-de-producao>" npm run db:migrate
   DATABASE_URL="<url-de-producao>" npm run db:seed
   ```

5. **Deploy**. A Vercel roda `npm run build` automaticamente.

6. **Primeiro acesso**: entre com `cesar1014` e a senha padrão `FZN2026`. O
   sistema exige a troca da senha antes de liberar qualquer página.

### Rotinas automáticas (cron)

O `vercel.json` já traz duas rotinas diárias — coleta de bilhetes às 08:00 e
atualização das dicas às 14:00 (horário de Brasília). Para elas funcionarem,
defina na Vercel a variável `CRON_SECRET` **com o mesmo valor** de
`WORKER_SECRET`: a Vercel envia esse segredo no cabeçalho `Authorization`, que
é o que os workers verificam.

O plano Hobby da Vercel permite duas rotinas, uma vez por dia cada — é o que
está configurado. Isso basta porque as páginas de Dicas também se atualizam
sozinhas quando alguém as abre (`SPORTS_REFRESH_ON_VIEW=true`), respeitando o
mesmo controle de quota.

Para acompanhamento ao vivo de verdade, aumente a frequência da rotina
`sports` no `vercel.json` (plano Pro) ou aponte um cron externo gratuito
(cron-job.org, GitHub Actions) para:

```
POST https://SEU-APP/api/workers/sports?job=live
Authorization: Bearer <WORKER_SECRET>
```

O endpoint `/api/health` responde `200` quando o banco está acessível — útil
para monitoramento.

---

## 3. Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | ambiente de desenvolvimento |
| `npm run build` / `npm start` | build e execução em produção |
| `npm run db:migrate` | aplica as migrations pendentes |
| `npm run db:seed` | cria a banca, as configurações e o administrador |
| `npm run db:seed -- --demo` | acrescenta sócios e entradas de exemplo |
| `npm run db:reset` | **apaga tudo** e recria o schema (pede confirmação) |
| `npm run sports:worker` | worker local da Central de Dicas (chama `/api/workers/sports`) |
| `npm test` | suíte de testes do domínio, das dicas e dos bilhetes (128 casos, sem banco nem rede) |
| `npm run typecheck` | verificação de tipos |
| `npm run lint` | ESLint |

Teste do schema contra um banco real:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/integration.sql
```

---

## 4. Configuração inicial

Criada pelo seed e **inteiramente editável** em *Configurações* — nenhum destes
números está fixo no código:

| Parâmetro | Valor inicial |
| --- | --- |
| Banca inicial | R$ 5.000,00 |
| Meta de lucro mensal | R$ 3.000,00 |
| Banca-alvo | R$ 8.000,00 |
| Dias ativos | 30 |
| Meta diária | R$ 100,00 (meta ÷ dias ativos) |
| Risco máximo por entrada | 1% da banca → R$ 50,00 |
| Stop diário | 3% → R$ 150,00 |
| Stop semanal | 6% → R$ 300,00 |
| Stop mensal | 10% → R$ 500,00 |
| Entrada acima da stake máxima | bloquear |
| Stop atingido | alertar |

---

## 5. Páginas

| Rota | Conteúdo |
| --- | --- |
| `/login` | acesso |
| `/dashboard` | cartões da banca, progresso da meta, gráfico meta × realizado, risco, últimas entradas |
| `/entradas` | registro e resolução de apostas, com verificação de risco antes de gravar |
| `/dicas` | Central de Dicas: destaques, hoje, próximos, ao vivo, histórico e performance |
| `/bilhetes` | múltiplas publicadas por fontes públicas, com odd real conferida, margem acumulada e placar por fonte |
| `/metas` | acompanhamento dia a dia: meta acumulada, realizado, banca-alvo, banca real, status |
| `/historico` | todas as entradas, com filtros combináveis e totais do resultado filtrado |
| `/socios` | participações, capital, saldo teórico e usuários de acesso |
| `/movimentacoes` | aportes e retiradas |
| `/estatisticas` | ranking por integrante e recortes por esporte, mercado e faixa de odd |
| `/fechamento` | prévia e fechamento do mês, histórico mensal e comparativo |
| `/configuracoes` | metas, risco, permissões e troca de senha |
| `/auditoria` | tudo que foi alterado, por quem e quando, com valor anterior e novo |

---

## 6. Como o dinheiro é calculado

| Status | Lucro | Retorno |
| --- | --- | --- |
| Green | `stake × (odd − 1)` | `stake + lucro` |
| Red | `− stake` | 0 |
| Void | 0 | `stake` |
| Cashout | `retorno − stake` | informado |
| Aberta | 0 | 0 |

```
banca = banca inicial + lucro das entradas + aportes − retiradas
```

Aporte **não** é lucro e retirada **não** é prejuízo: entram por um caminho
separado em toda agregação. Valores monetários são inteiros de centavos, odds
inteiros × 1000 e percentuais em basis points — nunca ponto flutuante.

Detalhes completos das regras, do modelo de dados e das permissões estão em
[`ARQUITETURA.md`](./ARQUITETURA.md).

---

## 7. Segurança

- Toda rota privada exige sessão válida (middleware + revalidação no servidor).
- Permissões são verificadas **no servidor** antes de qualquer escrita; a
  interface apenas esconde o que a pessoa não pode fazer.
- Lucro, banca, ROI e participações são **sempre recalculados no servidor** — o
  frontend nunca envia valor calculado.
- O banco tem `CHECK` constraints que replicam as regras de lucro: um resultado
  incoerente é recusado mesmo que alguém escreva direto no banco.
- Senhas com scrypt e salt individual; trocar a senha ou desativar um usuário
  encerra na hora todas as sessões dele.
- Registros são isolados por banca em todas as consultas.

---

## 8. Estrutura

```
db/migrations/   schema em SQL versionado
scripts/         migrate, seed, reset
tests/           testes do domínio e do schema
src/lib/domain/  regras de negócio puras (sem I/O) — o coração do sistema
src/lib/repos/   acesso ao banco
src/lib/services/orquestração: permissão + regra + persistência + auditoria
src/actions/     Server Actions
src/app/         páginas
src/components/  interface
```
