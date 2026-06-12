# Nancy

Aplicação web de controle financeiro pessoal com agente de IA, suporte a PWA, relatórios mensais em PDF e sistema de planos com trial.

**Stack:** React 18 + Vite · Node.js + Express · Prisma + PostgreSQL · Groq IA · Google Cloud Run · Supabase · Cloudflare

---

## Funcionalidades

| Módulo | Descrição |
|--------|-----------|
| **Autenticação** | Login/registro com JWT em cookie httpOnly, reset de senha por e-mail, verificação de e-mail, 2FA (TOTP + códigos de backup) |
| **Transações** | Registro de receitas e despesas por categoria, paginação, importação CSV |
| **Parcelamentos** | Criação de planos de parcelamento, pagamento/estorno de parcelas individuais |
| **Contas Fixas** | Cadastro de despesas recorrentes com lançamento automático mensal |
| **Dashboard** | Resumo financeiro, gráficos, histórico de 6 meses, previsão de IA |
| **Calendário** | Visualização de transações por data em formato de calendário |
| **Metas** | Metas financeiras com progresso e prazo |
| **Busca** | Overlay de busca global de transações com atalho de teclado |
| **Agente IA** | Chat com assistente financeiro (Groq), cria transações por linguagem natural |
| **Relatório** | Fechamento mensal com PDF gerado no servidor e enviado por e-mail |
| **Notificações** | Web Push via Service Worker (PWA) + alertas de disponibilidade |
| **Planos** | Free · Pro · Elite — com trial automático e sistema de referral |
| **Pagamentos** | Checkout via Mercado Pago, webhook de confirmação, polling de ativação |
| **Onboarding** | Modal de boas-vindas para novos usuários |

---

## Arquitetura

```
┌───────────────────────────────────────────────────────────────────┐
│  Browser                                                          │
│  React 18 SPA + Service Worker (PWA)                             │
│  ┌────────┐ ┌────────────┐ ┌──────────┐ ┌───────────────────┐    │
│  │ pages/ │ │components/ │ │ hooks/   │ │ services/api.js   │    │
│  └────────┘ └────────────┘ └──────────┘ └─────────┬─────────┘    │
└────────────────────────────────────────────────────│──────────────┘
                                          HTTPS + httpOnly Cookie
                                                      │
                                          ┌───────────▼───────────┐
                                          │  Cloudflare            │
                                          │  DNS Proxy + WAF       │
                                          └───────────┬───────────┘
                                                      │
┌─────────────────────────────────────────────────────▼────────────┐
│  Google Cloud Run — southamerica-east1 (São Paulo)                │
│                                                                   │
│  Express 4                                                        │
│  ├─ Middleware: Helmet · CORS · Rate Limit · JWT · Compression    │
│  ├─ /api/auth          → auth.js                                  │
│  ├─ /api/auth/2fa      → twoFactor.js                            │
│  ├─ /api/transactions  → transactions.js                          │
│  ├─ /api/installments  → installments.js                         │
│  ├─ /api/budget        → budget.js                               │
│  ├─ /api/goals         → goals.js                                │
│  ├─ /api/reports       → reports.js                              │
│  ├─ /api/agent         → agent.js ──────────────► Groq API       │
│  ├─ /api/notifications → notifications.js                        │
│  ├─ /api/payments      → payments.js ───────────► Mercado Pago   │
│  ├─ /api/monitor       → monitor.js                              │
│  ├─ /health + /ping    → health check (cache 30s)                │
│  └─ /* (SPA catch-all) → serve frontend/dist                     │
│                                                                   │
│  Services                                                         │
│  ├─ emailService.js  → Nodemailer + Gmail SMTP                   │
│  ├─ pdfService.js    → PDFKit (geração em memória)               │
│  └─ pushService.js   → web-push (VAPID)                          │
│                                                                   │
│  Observabilidade                                                  │
│  ├─ Sentry (SENTRY_DSN) — erros de backend                       │
│  └─ PostHog (POSTHOG_KEY) — analytics de frontend                │
│                                                                   │
│  Prisma ORM                                                       │
│  └─────────────────────────────────────────────► Supabase        │
│                                                   PostgreSQL     │
│                                                   (sa-east-1)    │
└──────────────────────────────────────────────────────────────────┘
```

**Build de produção:** Multi-stage Docker. Stage 1 compila o React (`npm run build`). Stage 2 copia o `dist/` para `backend/public/` e serve via Express. Um único container serve frontend + API.

**Deploy:** `gcloud run deploy finance-app --source .` (ou `npm run deploy` na raiz). Migrations são aplicadas automaticamente na inicialização do container com retry e advisory lock para concorrência segura.

---

## Estrutura do Projeto

```
finance-app/
│
├── Dockerfile              # Multi-stage build (produção: React + Node.js em 1 container)
├── docker-compose.yml      # Ambiente de desenvolvimento local
├── package.json            # Scripts de conveniência do monorepo
├── .env.example            # Template de variáveis de ambiente (copie para .env)
│
├── .github/
│   └── workflows/
│       ├── ci.yml          # CI: testes em todo push/PR (Jest + Vitest + Playwright)
│       ├── deploy.yml      # CD: deploy automatizado para Cloud Run no merge em main
│       ├── keepalive.yml   # Cron diário (09h Brasília): mantém Supabase free acordado
│       └── staging.yml     # Validação de upgrades major (branches upgrade/*)
│
├── backend/
│   ├── src/
│   │   ├── server.js           # Entry point: Express, middlewares, health check, graceful shutdown
│   │   │
│   │   ├── routes/
│   │   │   ├── auth.js             # /api/auth/* — login, registro, JWT, perfil, planos, referral
│   │   │   ├── twoFactor.js        # /api/auth/2fa/* — setup, verificação, códigos de backup
│   │   │   ├── transactions.js     # /api/transactions/* — CRUD, dashboard, CSV import, auto-launch
│   │   │   ├── installments.js     # /api/installments/* — parcelamentos, pagar/estornar parcelas
│   │   │   ├── budget.js           # /api/budget/* — contas fixas, salário, limites por categoria
│   │   │   ├── goals.js            # /api/goals/* — metas financeiras
│   │   │   ├── reports.js          # /api/reports/* — fechamento mensal (PDF + e-mail)
│   │   │   ├── agent.js            # /api/agent/* — chat IA, predict, relatório IA (Groq)
│   │   │   ├── notifications.js    # /api/notifications/* — assinaturas Web Push (VAPID)
│   │   │   ├── payments.js         # /api/payments/* — checkout Mercado Pago, webhook, histórico
│   │   │   └── monitor.js          # /api/monitor/* — stats de login e usuários (protegido)
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.js             # Verifica JWT (cookie ou header Authorization)
│   │   │   └── rateLimiter.js      # Rate limiting por rota (express-rate-limit)
│   │   │
│   │   ├── services/
│   │   │   ├── emailService.js     # Envio de e-mails (relatório PDF + reset + verificação)
│   │   │   ├── pdfService.js       # Geração de relatório PDF em memória (PDFKit)
│   │   │   └── pushService.js      # Envio de Web Push para assinantes do usuário
│   │   │
│   │   └── lib/
│   │       └── prisma.js           # Singleton do Prisma Client + retry middleware + pool config
│   │
│   ├── prisma/
│   │   ├── schema.prisma           # Modelos: User, Transaction, Budget, Goal, InstallmentPlan...
│   │   └── migrations/             # 20+ migrations SQL com histórico completo
│   │
│   └── __tests__/                  # 201 testes Jest (mocks via jest-mock-extended)
│
└── frontend/
    ├── src/
    │   ├── App.jsx             # BrowserRouter + lazy routes + PrivateRoute guard
    │   │
    │   ├── pages/
    │   │   ├── Landing.jsx         # Página inicial (não autenticado)
    │   │   ├── Login.jsx           # Login, registro e 2FA
    │   │   ├── Dashboard.jsx       # Dashboard principal com métricas e gráficos
    │   │   ├── Transactions.jsx    # Listagem e gestão de transações + parcelamentos
    │   │   ├── Analytics.jsx       # Análises por categoria e histórico
    │   │   ├── Calendar.jsx        # Visualização de transações por data
    │   │   ├── Goals.jsx           # Metas financeiras
    │   │   ├── Settings.jsx        # Perfil, salário, contas fixas, 2FA, notificações
    │   │   ├── Planos.jsx          # Página de planos Free/Pro/Elite + checkout MP
    │   │   ├── VerifyEmail.jsx     # Confirmação de e-mail via token
    │   │   ├── ForgotPassword.jsx
    │   │   ├── ResetPassword.jsx
    │   │   ├── PrivacyPolicy.jsx
    │   │   ├── TermsOfUse.jsx
    │   │   └── NotFound.jsx
    │   │
    │   ├── components/
    │   │   ├── features/
    │   │   │   ├── AgentChat.jsx           # Chat flutuante com agente IA
    │   │   │   ├── TransactionForm.jsx     # Formulário de nova transação
    │   │   │   ├── AutoLaunchPrompt.jsx    # Banner de lançamento de contas fixas
    │   │   │   ├── PlanExpiryBanner.jsx    # Banner de trial/expiração de plano
    │   │   │   ├── EliteConversionModal.jsx # Modal de conversão pós-trial
    │   │   │   ├── EmailVerificationBanner.jsx
    │   │   │   ├── OnboardingModal.jsx     # Boas-vindas para novos usuários
    │   │   │   ├── SearchOverlay.jsx       # Busca global de transações
    │   │   │   ├── InstallBanner.jsx       # Banner de instalação PWA
    │   │   │   ├── CookieBanner.jsx
    │   │   │   └── settings/              # Cards da página de configurações
    │   │   ├── layout/
    │   │   │   └── Navbar.jsx
    │   │   └── ui/
    │   │       ├── CurrencyInput.jsx
    │   │       ├── DateInput.jsx
    │   │       ├── GradCard.jsx
    │   │       └── UpgradeModal.jsx
    │   │
    │   ├── hooks/
    │   │   ├── useUser.js          # Lê/persiste usuário no sessionStorage com sync entre abas
    │   │   └── useTheme.js         # Toggle dark/light com persistência no localStorage
    │   │
    │   └── services/
    │       ├── api.js              # Axios instance + todas as funções de chamada à API
    │       ├── analytics.js        # PostHog wrapper (no-op quando sem chave)
    │       ├── cache.js            # Cache em memória com TTL
    │       └── installPrompt.js    # Lógica de instalação PWA (beforeinstallprompt)
    │
    ├── public/                 # Assets estáticos (ícones, manifest.json, sw.js)
    ├── index.html
    ├── vite.config.js
    └── __tests__/              # 141 testes Vitest + 91 testes E2E Playwright
```

---

## CI/CD — GitHub Actions

O projeto tem 4 workflows automatizados:

### CI — Testes e Qualidade (`ci.yml`)
Dispara em todo push (exceto `main`) e em PRs. Bloqueia o merge se qualquer job falhar.

```
Backend · Jest (201)  ─┐
Frontend · Vitest (141)─┼─→  E2E · Playwright (91)
Build · Vite (prod)   ─┘
```

### CD — Deploy para Cloud Run (`deploy.yml`)
Dispara no merge em `main`. Repete todos os testes, aplica migrations e deploya. Rollback automático se o health check falhar.

```
Testes → Schema → Migration → Deploy → Health Check → Smoke Tests
                                                           ↓ falhou
                                                      Rollback automático
```

Modos manuais disponíveis: `deploy`, `rollback`, `deploy-skip-e2e` (emergência).

### Keep-Alive (`keepalive.yml`)
Cron diário às 09h (Brasília). Pinga o `/health` para evitar que o Supabase free entre em modo de pausa após 7 dias sem acesso.

### Staging — Major Upgrades (`staging.yml`)
Sobe PostgreSQL real dentro do CI e roda os 201 testes backend contra banco de verdade. Dispara apenas em branches `upgrade/prisma-*`, `upgrade/express-*`.

---

## Desenvolvimento Local

### Pré-requisitos
- [Docker](https://docs.docker.com/get-docker/) e Docker Compose
- (Opcional) Node.js 20+ para rodar sem Docker

### Passo a passo

**1. Clone e configure o ambiente:**
```bash
git clone <repo> && cd finance-app
cp .env.example .env
# Edite o .env: preencha DATABASE_URL e JWT_SECRET (mínimo obrigatório)
```

**2. Inicie com Docker Compose (recomendado):**
```bash
npm run dev          # docker compose up
npm run dev:build    # docker compose up --build (primeiro uso)
```

Acesse:
- **App:** http://localhost:5173
- **API:** http://localhost:3001
- **Health check:** http://localhost:3001/health

**3. Ou inicie manualmente (sem Docker):**
```bash
npm run install:all      # instala dependências de backend + frontend
npm run dev:backend      # terminal 1 — API em http://localhost:3001
npm run dev:frontend     # terminal 2 — App em http://localhost:5173
```

**4. Scripts de banco de dados:**
```bash
npm run db:studio    # Prisma Studio (UI para o banco)
npm run db:migrate   # Cria nova migration a partir de mudanças no schema.prisma
npm run db:generate  # Regenera o Prisma Client (após alterar schema.prisma)
```

**5. Testes:**
```bash
cd backend  && npm test           # Jest — 201 testes unitários (sem banco)
cd frontend && npm run test:run   # Vitest — 141 testes de componentes
npm run test:e2e                  # Playwright — 91 testes E2E (Chromium)
```

---

## Deploy (Produção)

A produção roda no **Google Cloud Run** (região `southamerica-east1`). O deploy compila o frontend dentro do Docker e sobe um único container com Express servindo tudo.

```bash
npm run deploy

# Equivalente manual:
gcloud run deploy finance-app \
  --source . \
  --region southamerica-east1 \
  --quiet
```

> **Importante:** Sempre rode o deploy a partir da raiz do projeto. O `Dockerfile` raiz faz o build multi-stage. O `backend/Dockerfile` é apenas para o docker-compose local.

As migrations pendentes são aplicadas na inicialização do container com retry automático (4 tentativas, backoff exponencial) e advisory lock do PostgreSQL para serializar execuções concorrentes.

---

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|----------|:-----------:|-----------|
| `NODE_ENV` | Sim | `development` \| `production` |
| `PORT` | Não | Porta do Express (padrão: 3001; Cloud Run usa 8080) |
| `DATABASE_URL` | **Sim** | Connection string PostgreSQL (Supabase) |
| `JWT_SECRET` | **Sim** | Chave secreta JWT (mín. 64 chars) |
| `APP_URL` | Não | URL base para links de reset de senha e verificação |
| `ALLOWED_ORIGINS` | Prod | Origins permitidas no CORS (separadas por vírgula) |
| `EMAIL_USER` | Não | Gmail para envio de e-mails |
| `EMAIL_PASS` | Não | App Password do Gmail (16 chars) |
| `VAPID_PUBLIC_KEY` | Não | Chave pública Web Push |
| `VAPID_PRIVATE_KEY` | Não | Chave privada Web Push |
| `GROQ_API_KEY` | Não | API Groq para agente IA (sem chave → 503) |
| `MP_ACCESS_TOKEN` | Não | Access token Mercado Pago (pagamentos) |
| `MP_WEBHOOK_SECRET` | Não | Segredo para validar webhooks do Mercado Pago |
| `UPGRADE_SECRET` | Não | Segredo para ativar plano Pro manualmente |
| `MONITOR_SECRET` | Não | Header de autenticação do `/api/monitor` |
| `MONITOR_COOLDOWN_MINUTES` | Não | Intervalo mínimo entre alertas push (padrão: 15) |
| `SENTRY_DSN` | Não | DSN do Sentry para monitoramento de erros (backend) |
| `VITE_SENTRY_DSN` | Não | DSN do Sentry para monitoramento de erros (frontend) |
| `POSTHOG_KEY` | Não | Chave do PostHog para analytics de frontend |
| `POSTHOG_HOST` | Não | Host do PostHog (padrão: https://us.i.posthog.com) |

---

## Referência da API

Todas as rotas ficam sob `/api/`. Rotas protegidas exigem cookie `token` (JWT).

### Autenticação — `/api/auth`
| Método | Rota | Auth | Descrição |
|--------|------|:----:|-----------|
| POST | `/register` | — | Cria conta (nome, e-mail, senha) |
| POST | `/login` | — | Autenticação, define cookie JWT |
| POST | `/logout` | — | Limpa cookie JWT |
| GET | `/me` | ✓ | Retorna dados do usuário logado |
| PUT | `/profile` | ✓ | Atualiza nome e/ou e-mail de relatório |
| POST | `/forgot-password` | — | Envia e-mail com link de reset |
| POST | `/reset-password` | — | Redefine senha via token |
| POST | `/verify-email` | — | Confirma e-mail via token |
| POST | `/resend-verification` | ✓ | Reenvia e-mail de verificação |
| POST | `/upgrade` | ✓ | Ativa plano Pro (requer `UPGRADE_SECRET`) |
| POST | `/downgrade` | ✓ | Volta para plano Free |

### 2FA — `/api/auth/2fa`
| Método | Rota | Auth | Descrição |
|--------|------|:----:|-----------|
| POST | `/setup` | ✓ | Gera secret TOTP e QR code |
| POST | `/verify` | ✓ | Confirma código e ativa 2FA |
| POST | `/disable` | ✓ | Desativa 2FA |
| POST | `/validate` | — | Valida código no login |
| GET | `/backup-codes` | ✓ | Lista códigos de backup |
| POST | `/backup-codes/regenerate` | ✓ | Regenera códigos de backup |

### Transações — `/api/transactions`
| Método | Rota | Auth | Descrição |
|--------|------|:----:|-----------|
| GET | `/dashboard` | ✓ | Summary + transações + limites em 1 chamada |
| GET | `/` | ✓ | Lista transações do mês (paginado) |
| GET | `/summary` | ✓ | Resumo financeiro do mês |
| GET | `/monthly-history` | ✓ | Histórico de receitas/despesas (últimos N meses) |
| GET | `/subscriptions` | ✓ | Detecção de gastos recorrentes |
| POST | `/` | ✓ | Cria transação (expense ou income) |
| DELETE | `/:id` | ✓ | Remove transação |
| POST | `/auto-launch` | ✓ | Lança contas fixas como transações do mês |
| POST | `/import` | ✓ | Importa transações de arquivo CSV |

### Parcelamentos — `/api/installments`
| Método | Rota | Auth | Descrição |
|--------|------|:----:|-----------|
| GET | `/` | ✓ | Lista planos de parcelamento |
| POST | `/` | ✓ | Cria plano de parcelamento |
| PATCH | `/:id/pay` | ✓ | Marca próxima parcela como paga (cria transação) |
| PATCH | `/:id/unpay` | ✓ | Estorna última parcela paga (remove transação) |
| DELETE | `/:id` | ✓ | Remove plano de parcelamento |

### Contas Fixas — `/api/budget`
| Método | Rota | Auth | Descrição |
|--------|------|:----:|-----------|
| GET | `/` | ✓ | Lista contas fixas |
| POST | `/` | ✓ | Cria conta fixa |
| PUT | `/:id` | ✓ | Atualiza conta fixa |
| DELETE | `/:id` | ✓ | Remove conta fixa |
| PUT | `/salary` | ✓ | Atualiza salário mensal |
| GET | `/category-limits` | ✓ | Lista limites por categoria |
| POST | `/category-limits` | ✓ | Cria/atualiza limite de categoria |
| DELETE | `/category-limits/:category` | ✓ | Remove limite de categoria |

### Metas — `/api/goals`
| Método | Rota | Auth | Descrição |
|--------|------|:----:|-----------|
| GET | `/` | ✓ | Lista metas |
| POST | `/` | ✓ | Cria meta |
| PATCH | `/:id` | ✓ | Atualiza meta |
| DELETE | `/:id` | ✓ | Remove meta |

### Relatórios — `/api/reports`
| Método | Rota | Auth | Descrição |
|--------|------|:----:|-----------|
| POST | `/monthly-close` | ✓ | Fecha mês: gera PDF, envia e-mail, arquiva transações (Pro/Elite) |
| GET | `/history` | ✓ | Lista meses já fechados |

### Agente IA — `/api/agent`
| Método | Rota | Auth | Descrição |
|--------|------|:----:|-----------|
| POST | `/chat` | ✓ | Chat com assistente financeiro (Groq) |
| POST | `/predict` | ✓ | Previsão de encerramento do mês |
| POST | `/monthly-report` | ✓ | Relatório textual do mês gerado por IA |

### Notificações — `/api/notifications`
| Método | Rota | Auth | Descrição |
|--------|------|:----:|-----------|
| GET | `/vapid-public-key` | ✓ | Retorna chave pública VAPID |
| POST | `/subscribe` | ✓ | Salva assinatura Web Push |
| POST | `/unsubscribe` | ✓ | Remove assinatura Web Push |

### Pagamentos — `/api/payments`
| Método | Rota | Auth | Descrição |
|--------|------|:----:|-----------|
| POST | `/create-preference` | ✓ | Cria preferência de pagamento no Mercado Pago |
| POST | `/webhook` | — | Recebe notificações do Mercado Pago (IPN) |
| GET | `/history` | ✓ | Histórico de pagamentos processados |

### Monitor — `/api/monitor`
| Método | Rota | Auth | Descrição |
|--------|------|:----:|-----------|
| GET | `/login-stats` | `x-monitor-secret` | Estatísticas de login (tentativas, falhas) |
| GET | `/user-stats` | `x-monitor-secret` | Estatísticas de usuários e planos |

### Health Check (sem auth)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/ping` | Resposta imediata (mede latência do servidor) |
| GET | `/health` | Status do servidor + DB (cache de 30s, atualizado em background) |

---

## Banco de Dados

**ORM:** Prisma 5 · **Banco:** PostgreSQL (Supabase, sa-east-1)

```
User
  ├── id, name, email, password, salary
  ├── plan (free | pro | elite)
  ├── planExpiresAt, trialEndsAt, planPeriod
  ├── referralCode, referredBy
  ├── twoFactorSecret, twoFactorEnabled
  ├── onboardingComplete, emailVerified, emailVerifyToken
  ├── reportEmail, resetToken, resetTokenExpiry
  ├── autoLaunchMonth, autoLaunchYear
  ├── notifBudgetAlert, notifBudgetReminder
  ├── transactions[]
  ├── budgets[]
  ├── categoryLimits[]
  ├── goals[]
  ├── installmentPlans[]
  ├── pushSubscriptions[]
  └── twoFactorBackupCodes[]

Transaction
  └── id, description, amount, type, category, date, month, year, archived, userId

Budget
  └── id, name, amount, dueDay, userId

CategoryLimit
  └── id, category, amount, userId  [unique: userId+category]

Goal
  └── id, title, targetAmount, currentAmount, color, deadline, userId

InstallmentPlan
  └── id, name, totalAmount, totalInstallments, paidInstallments, userId

TwoFactorBackupCode
  └── id, code (hashed), used, userId

ProcessedPayment
  └── id, paymentId, userId, plan, amount, createdAt  [idempotência de webhook]

LoginAudit
  └── id, email, ip, success, createdAt  [índices para monitor de segurança]
```

**Migrations:** 20+ arquivos SQL em `backend/prisma/migrations/` com histórico completo desde o baseline.

---

## Segurança

- **JWT** em cookie `httpOnly; secure; sameSite=strict` (24h)
- **bcrypt** (rounds=12) + DUMMY_HASH para prevenir timing attack no login
- **2FA** via TOTP (RFC 6238) com códigos de backup hasheados
- **Rate limiting** por IP/userId: login 10/15min, agente 40/hora, geral 200/15min, pagamentos 10/15min
- **Helmet** (CSP, HSTS, X-Frame-Options, etc.) + `Permissions-Policy`
- **`Cache-Control: no-store`** em todas as rotas `/api/`
- **UUID validation** em todos os parâmetros de rota
- **CORS** restrito a origins configuradas em produção
- **SSRF protection** no endpoint de Web Push (whitelist de hosts)
- **`crypto.timingSafeEqual`** para comparação de segredos (UPGRADE_SECRET, MONITOR_SECRET)
- **`X-Request-Id`** em todas as respostas para correlação de logs
- **LoginAudit** — log de todas as tentativas de autenticação
- **Idempotência de webhook** — `ProcessedPayment` previne ativação dupla de plano
- **RLS (Row Level Security)** habilitado no Supabase
