# Confiabilidade do Nancy — SLI, SLO e SLA

> **Status:** SLI e SLO em vigor (informal → formalizado aqui). SLA ainda **não implementado** — aguardando dado histórico de uptime.
> **Data:** 2026-09-01 | **Origem:** auditoria de código pós-incidente (bugs de IA relatados por beta testers)

---

## Por que este documento existe

Uma auditoria de código encontrou SLI e SLO **de fato em produção**, mas nunca nomeados nem escritos — viviam espalhados em comentário de código e no comportamento de scripts. Este documento não cria nada do zero: **nomeia e centraliza** o que já roda, fecha a lacuna de observabilidade mais importante encontrada (Sentry cobrindo só 1 domínio em 11), e registra o plano pra quando o SLA fizer sentido.

---

## SLI — Indicadores de Nível de Serviço

O que medimos hoje, e o que cada um cobre (e não cobre).

### 1. Disponibilidade do banco — `GET /health`

`backend/src/server.js:241-309`

- Mede exclusivamente se o Postgres responde a um `SELECT 1`, via um cliente Prisma **dedicado** (`connection_limit=1`), isolado do pool usado pelas rotas reais — pra uma lentidão no health check nunca contaminar requisições de verdade.
- Cache de 30s, revalidado por um `setInterval` a cada 15s em produção — a requisição HTTP quase nunca dispara uma query nova.
- Status só vira `degraded` (HTTP 503) depois de **3 falhas consecutivas** do ping — uma reconexão isolada não derruba o indicador.
- **Não cobre**: memória, CPU, disco, filas, ou qualquer dependência externa (Groq, Mercado Pago, Resend).

### 2. Latência do processo — `GET /ping`

`backend/src/server.js:263`

- Não toca em nenhuma dependência — só devolve `{status:'ok', ts}`. Mede exclusivamente se o processo Express está respondendo, isolado do banco.

### 3. Taxa de erro por rota — Sentry

`backend/src/lib/sentry.js` (novo) + `Sentry.setupExpressErrorHandler` em `server.js`

- Até 2026-09-01, o Sentry só capturava erro automático de **1 domínio em 11** — só as rotas já migradas pra arquitetura em camadas nova (`GoalController.js`, via `next(err)`) chegavam até ele. As outras 11 rotas legadas (`agent.js`, `auth.js`, `transactions.js`, `payments.js`, etc.) capturavam o próprio erro em `try/catch` e respondiam direto, sem nunca notificar o Sentry — foi assim que os 2 bugs de IA desta sessão só foram descobertos por relato manual de beta tester, não por alerta.
- **Fechado nesta sessão**: todas as 11 rotas legadas agora chamam `reportError(err, { tag })` (`backend/src/lib/sentry.js`) no lugar de `console.error` cru — o helper loga no console **e** reporta ao Sentry quando `SENTRY_DSN` está configurado. Taxa de erro por rota passa a ser um SLI real, visível no dashboard do Sentry, sem precisar de infra nova.
- **Cota**: Sentry está no tier gratuito (`tracesSampleRate: 0.1` no backend, `0.05` no frontend — escolhido pra não estourar os 10k eventos/mês do plano free). Se o volume de erro crescer muito, a amostragem esconde parte do sinal — vale revisitar o tier se isso virar um limitador de verdade.

---

## SLO — Objetivos de Nível de Serviço

### Capacidade / volume de uso — os 14 rate limiters

`backend/src/middleware/rateLimiter.js` — cada linha já existia como número + janela + justificativa de negócio em comentário; aqui só vira política publicada.

| Limiter | Janela | Limite | Chave |
|---|---|---|---|
| `webhookLimiter` | 15 min | 500 | IP |
| `apiLimiter` | 15 min | 200 | userId / IP |
| `agentLimiter` | 1 h | 40 | userId / IP |
| `dashboardLimiter` | 1 min | 30 | userId |
| `transcribeLimiter` | 1 h | 20 | userId / IP |
| `loginLimiter` | 15 min | 10 | IP |
| `resetPasswordLimiter` | 15 min | 10 | IP |
| `twoFALimiter` | 15 min | 10 | IP |
| `paymentLimiter` | 15 min | 10 | userId |
| `reportLimiter` | 1 h | 5 | userId |
| `registerLimiter` | 1 h | 5 | IP |
| `exportLimiter` | 1 h | 5 | userId |
| `forgotPasswordLimiter` | 1 h | 3 | IP |
| `verifyEmailLimiter` | 1 h | 3 | userId |

Todos desativados em `NODE_ENV=test`. Chave default: `userId || IP`. Validado em runtime pelo `staging.yml` (dispara 11 tentativas de login e confirma 429 na 11ª).

### Disponibilidade do banco (SLO sobre o SLI #1)

O threshold de **3 falhas consecutivas** antes de `degraded` (`server.js:288`) é, na prática, o objetivo que já rege o indicador de saúde do banco — só nunca tinha sido escrito como meta.

### Qualidade de release — o pipeline de deploy

`deploy.yml` — só publica se, em sequência: testes (Jest + Vitest + E2E) passarem, schema Prisma estiver sincronizado com as migrations, o deploy no Cloud Run suceder, o health check pós-deploy responder 200 (3 tentativas), e os 6 smoke tests passarem. Qualquer falha depois do deploy aciona **rollback automático** pra revisão anterior. Não há meta graduada (cobertura de teste mínima, orçamento de performance) — é um gate binário, mas é o SLO mais rigoroso que o projeto de fato aplica.

### Uptime histórico — ainda sem número (próximo passo)

Não existe hoje nenhuma série histórica de disponibilidade — o health check é ponto-a-ponto, sem persistência. Decisão tomada em 2026-09-01: configurar um monitor externo gratuito (UptimeRobot ou equivalente) apontando pro `/health` de produção e homologação, em vez de expandir o Prometheus/Grafana local (esse stack já existe nesta máquina, mas monitora só o host local — alcançar o Cloud Run, que escala a zero, exigiria infra nova sempre ligada, o oposto do que a sessão de hoje corrigiu no custo do GCP).

Depois de ~2-4 semanas de dado acumulado, definir aqui um SLO numérico real (ex: "99.5% de uptime mensal"), baseado no que os dados mostram — não em um chute.

**Nota:** existe um serviço externo já configurado, "finance-monitor" (Vercel, fora deste repositório), referenciado em `.env.example:70-74`, que aparentemente já faz ping no `/health`. O webhook que ele citava (`POST /api/monitor-alert`) não existe neste código — vale confirmar se esse serviço segue ativo antes de decidir se o UptimeRobot substitui ou roda em paralelo com ele.

---

## SLA — Acordo de Nível de Serviço

**Status: não implementado.** O único texto relacionado a disponibilidade no produto é uma cláusula de isenção de responsabilidade, não um compromisso:

> "Buscamos manter o serviço disponível 24/7, mas não garantimos disponibilidade ininterrupta. Manutenções programadas serão comunicadas com antecedência. Não nos responsabilizamos por perdas decorrentes de indisponibilidade temporária."
> — `frontend/src/pages/TermsOfUse.jsx:110-115`, seção "7. Disponibilidade do serviço"

**Por quê ainda não**: um SLA promete um número. Prometer um número sem dado histórico real é chute — e chute errado em compromisso público com usuário pagante é pior que não ter SLA nenhum.

**Plano**: assim que a coleta de uptime (seção anterior) acumular 1-3 meses de dado real, decidir:
1. Que número de disponibilidade é sustentável prometer de verdade, baseado no que os dados já mostraram.
2. Se o SLA é **soft** (meta pública, sem remédio contratual) ou **hard** (com crédito/reembolso se não cumprido) — decisão de negócio sobre apetite a risco, não técnica.
3. Só então atualizar `TermsOfUse.jsx:110-115`, substituindo a isenção de responsabilidade atual por um compromisso de verdade.

Nenhuma ação de código pendente aqui — só aguardar dado.
