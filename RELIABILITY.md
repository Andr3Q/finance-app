# Confiabilidade do Nancy — SLI, SLO, SLA e engenharia de resiliência

> **Status:** SLI em vigor. SLO documentado, coleta de uptime em andamento. SLA: **rascunho pronto** (soft, sem reembolso), aguardando ~2-4 semanas de dado real pra preencher o número antes de publicar em `TermsOfUse.jsx`. **Durabilidade dos dados: risco aceito, não mitigado** (sem backup do banco — ver seção dedicada).
> **Data:** 2026-09-01 (SLI/SLO/SLA) · 2026-09-03 (isolamento multi-tenant, resiliência a dependências externas, durabilidade) | **Origem:** auditoria de código pós-incidente (bugs de IA relatados por beta testers) + auditoria de arquitetura de ponta a ponta

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

### Uptime histórico — coleta iniciada, meta numérica ainda pendente

Até 2026-09-01 não existia nenhuma série histórica de disponibilidade — o health check era ponto-a-ponto, sem persistência. Decisão: configurar um monitor externo gratuito (UptimeRobot) apontando pro `/health`, em vez de expandir o Prometheus/Grafana local (esse stack já existe nesta máquina, mas monitora só o host local — alcançar o Cloud Run, que escala a zero, exigiria infra nova sempre ligada, o oposto do que esta mesma sessão corrigiu no custo do GCP).

**Feito em 2026-09-01**: dois monitores HTTP criados no UptimeRobot (plano free, checagem a cada 5 min, alerta por e-mail), um pra cada ambiente:
- Homologação — `https://finance-app-staging-vzcnezphtq-rj.a.run.app/health`
- Produção — `https://myfinancepro.com.br/health`

**Pendente**: esperar ~2-4 semanas de dado acumulado e então definir aqui um SLO numérico real (ex: "99.5% de uptime mensal"), baseado no que os dados mostram — não em um chute. Revisitar esta seção a partir de ~2026-09-29.

**Nota:** existe um serviço externo já configurado, "finance-monitor" (Vercel, fora deste repositório), referenciado em `.env.example:70-74`, que aparentemente já faz ping no `/health`. O webhook que ele citava (`POST /api/monitor-alert`) não existe neste código — vale confirmar se esse serviço segue ativo antes de decidir se o UptimeRobot substitui ou roda em paralelo com ele.

---

## SLA — Acordo de Nível de Serviço

**Status: rascunho pronto, aguardando o número.** Hoje (`TermsOfUse.jsx:110-115`) o único texto relacionado a disponibilidade é uma cláusula de isenção de responsabilidade, não um compromisso:

> "Buscamos manter o serviço disponível 24/7, mas não garantimos disponibilidade ininterrupta. Manutenções programadas serão comunicadas com antecedência. Não nos responsabilizamos por perdas decorrentes de indisponibilidade temporária."

**Decisões já tomadas (2026-09-01)**:
- **Tipo: soft** — meta pública, com compromisso de transparência em caso de incidente, **sem** crédito/reembolso contratual. Risco jurídico/financeiro baixo, adequado ao estágio atual (Nancy ainda em teste fechado, sem histórico de uptime consolidado). Reavaliar pra "hard" (com reembolso) só depois de ter base de clientes pagantes estável e vários meses de dado consistente.
- **Por que o número ainda não está preenchido**: um SLA promete um número. Prometer sem dado histórico real é chute — e chute errado em compromisso público é pior que não ter SLA nenhum. A coleta via UptimeRobot (seção anterior) começou em 2026-09-01; revisitar esta seção a partir de **~2026-09-29** pra substituir o placeholder pelo número real.

**Rascunho do texto** — substitui a seção 7 de `TermsOfUse.jsx` quando o `[XX,X]` for preenchido com o número real. Mantém o tom direto já usado no resto do documento (parágrafos curtos, sem juridiquês):

> ### 7. Disponibilidade do serviço
>
> Nosso compromisso é manter o Nancy disponível **[XX,X]% do tempo, medido mensalmente**. Essa meta é acompanhada de forma automática e contínua, verificando o serviço a cada 5 minutos.
>
> Não entram no cálculo:
> - Manutenções programadas, sempre comunicadas com pelo menos 24h de antecedência
> - Indisponibilidade causada por provedores terceiros fora do nosso controle (ex: Google Cloud, Cloudflare, ou o banco de dados)
> - Situações de força maior
>
> Se tivermos um incidente que afete essa meta, publicamos um comunicado explicando o que aconteceu e o que estamos fazendo a respeito. Este é um compromisso de transparência — não gera direito a reembolso ou crédito.

**Antes de publicar** (quando o número estiver definido): confirmar se a meta vale igual pra todos os planos ou só Pro/Elite — o rascunho acima assume que vale pra todo mundo, por simplicidade, já que não tem remédio financeiro associado (é só transparência). Ajustar se fizer mais sentido diferenciar.

Nenhuma ação de código pendente aqui — só aguardar dado.

---

## Durabilidade dos dados — risco aceito, não mitigado

**Status: sem backup do banco. Decisão explícita de não implementar agora (2026-09-03).**

Diferente de disponibilidade (SLI/SLO/SLA acima, que trata de "o serviço está no ar?"), durabilidade trata de "se algo destruir os dados, dá pra recuperar?" — e hoje a resposta é **não**.

**Estado real, confirmado por auditoria de código (2026-09-03)**:
- Nenhuma rotina de backup automatizado do Postgres existe no repositório — nem `pg_dump` agendado, nem qualquer script de snapshot.
- O Supabase do Nancy está no **plano free** (`CONTEXTO_PROJETO.md`), que não inclui point-in-time recovery (PITR) nem backup diário automático — recursos exclusivos de planos pagos.
- Não existe runbook de "o que fazer se o banco corromper ou alguém rodar um DELETE errado em produção". O único rollback documentado (`deploy.yml`) reverte a **aplicação** pra revisão anterior do Cloud Run — não mexe em dado nenhum, porque não tem o que reverter.
- `GET /api/auth/export-data` (LGPD Art. 15) exporta os dados de **um** usuário, sob pedido dele — não é backup do sistema. `/api/admin/seed-staging` **apaga** dados de homologação pra recriar um fixture de teste — é o oposto de recuperação.

**Cenário de risco concreto**: um bug no código, um comando manual errado, ou uma falha do próprio Supabase que corrompa ou apague dados de clientes pagantes hoje não tem nenhum caminho de recuperação — os dados estariam perdidos permanentemente.

**Decisão (2026-09-03)**: não implementar nenhuma das opções abaixo agora — o custo recorrente do upgrade de tier não se justifica no estágio atual (poucos clientes pagantes, sem histórico de incidente de dados). Revisitar quando a base de clientes crescer o suficiente pra justificar o custo, ou antes, se houver qualquer sinal de risco elevado (ex: React a um quase-incidente).

**Opções avaliadas, prontas pra quando for retomado**:
1. **`pg_dump` agendado via GitHub Actions** — mesmo padrão gratuito já usado em `keepalive.yml`/`plan-reminders.yml`: cron diário faz dump do banco e sobe pra um bucket privado no GCS. Custo quase zero (centavos de storage), mas o pipeline de backup **e** de restore precisam ser construídos e mantidos pelo time — e um backup nunca testado não é um backup de verdade, então isso inclui testar a restauração pelo menos uma vez.
2. **Upgrade Supabase Pro** (~$25/mês) — inclui backup diário automático + PITR de 7 dias, mantido pelo próprio provedor. Mais confiável (testado por eles, não por nós), mas é custo recorrente novo.
3. Os dois juntos, pra redundância — descartado por ora pelo mesmo motivo de custo.

Nenhuma ação de código pendente aqui — decisão de custo/risco, não de engenharia. Revisitar junto com o número do SLA (~2026-09-29 é o próximo ponto natural de revisão de confiabilidade já agendado).
