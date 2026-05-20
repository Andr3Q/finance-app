# FinançasPro

Aplicação web de controle financeiro pessoal com agente de IA, suporte a PWA e relatórios mensais em PDF.

**Stack:** React 18 + Vite · Node.js + Express · Prisma + PostgreSQL · Groq IA · Google Cloud Run · Supabase

---

## Funcionalidades

| Módulo | Descrição |
|--------|-----------|
| **Autenticação** | Login/registro com JWT em cookie httpOnly, reset de senha por e-mail |
| **Transações** | Registro de receitas e despesas por categoria, paginação, importação CSV |
| **Contas Fixas** | Cadastro de despesas recorrentes com lançamento automático mensal |
| **Dashboard** | Resumo financeiro, gráficos, histórico de 6 meses, previsão de IA |
| **Metas** | Metas financeiras com progresso e prazo |
| **Agente IA** | Chat com assistente financeiro (Groq), cria transações por linguagem natural |
| **Relatório** | Fechamento mensal com PDF gerado no servidor e enviado por e-mail |
| **Notificações** | Web Push via Service Worker (PWA) + alertas de disponibilidade |
| **Planos** | Free (30 transações/mês, 3 contas fixas) e Pro (ilimitado + PDF) |

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser                                                        │
│  React 18 SPA + Service Worker (PWA)                           │
│  ┌────────┐ ┌────────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ pages/ │ │components/ │ │ hooks/   │ │ services/api.js   │  │
│  └────────┘ └────────────┘ └──────────┘ └─────────┬─────────┘  │
└────────────────────────────────────────────────────│────────────┘
                                          HTTPS + httpOnly Cookie
                                                      │
┌─────────────────────────────────────────────────────▼────────────┐
│  Google Cloud Run — southamerica-east1 (São Paulo)               │
│                                                                  │
│  Express 4                                                       │
│  ├─ Middleware: Helmet · CORS · Rate Limit · JWT · Compression   │
│  ├─ /api/auth          → auth.js                                 │
│  ├─ /api/transactions  → transactions.js                         │
│  ├─ /api/budget        → budget.js                               │
│  ├─ /api/goals         → goals.js                                │
│  ├─ /api/reports       → reports.js                              │
│  ├─ /api/agent         → agent.js ──────────────► Groq API       │
│  ├─ /api/notifications → notifications.js                        │
│  ├─ /api/monitor-alert → monitorAlert.js                         │
│  ├─ /health + /ping    → health check (cache 30s)                │
│  └─ /* (SPA catch-all) → serve frontend/dist                     │
│                                                                  │
│  Services                                                        │
│  ├─ emailService.js  → Nodemailer + Gmail SMTP                   │
│  ├─ pdfService.js    → PDFKit (geração em memória)               │
│  └─ pushService.js   → web-push (VAPID)                          │
│                                                                  │
│  Prisma ORM                                                      │
│  └─────────────────────────────────────────────► Supabase        │
│                                                   PostgreSQL     │
│                                                   (US West)      │
└──────────────────────────────────────────────────────────────────┘
```

**Build de produção:** Multi-stage Docker. Stage 1 compila o React (`npm run build`). Stage 2 copia o `dist/` para `backend/public/` e serve via Express. Um único container serve frontend + API.

**Deploy:** `gcloud run deploy finance-app --source .` (ou `npm run deploy` na raiz).

---

## Estrutura do Projeto

```
finance-app/
│
├── Dockerfile              # Multi-stage build (produção: React + Node.js em 1 container)
├── docker-compose.yml      # Ambiente de desenvolvimento local
├── package.json            # Scripts de conveniência do monorepo
├── .env.example            # Template de variáveis de ambiente (copie para .env)
├── .dockerignore
├── .gitignore
│
├── backend/
│   ├── src/
│   │   ├── server.js           # Entry point: Express, middlewares, health check, graceful shutdown
│   │   │
│   │   ├── routes/             # Um arquivo por domínio de negócio
│   │   │   ├── auth.js             # /api/auth/* — login, registro, JWT, perfil, planos
│   │   │   ├── transactions.js     # /api/transactions/* — CRUD, dashboard, CSV import, auto-launch
│   │   │   ├── budget.js           # /api/budget/* — contas fixas, salário, limites por categoria
│   │   │   ├── goals.js            # /api/goals/* — metas financeiras
│   │   │   ├── reports.js          # /api/reports/* — fechamento mensal (PDF + e-mail)
│   │   │   ├── agent.js            # /api/agent/* — chat IA, predict, relatório IA (Groq)
│   │   │   ├── notifications.js    # /api/notifications/* — assinaturas Web Push (VAPID)
│   │   │   └── monitorAlert.js     # /api/monitor-alert — webhook do finance-monitor
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.js             # Verifica JWT (cookie ou header Authorization)
│   │   │   └── rateLimiter.js      # Rate limiting por rota (express-rate-limit)
│   │   │
│   │   ├── services/
│   │   │   ├── emailService.js     # Envio de e-mails (relatório PDF + reset de senha)
│   │   │   ├── pdfService.js       # Geração de relatório PDF em memória (PDFKit)
│   │   │   └── pushService.js      # Envio de Web Push para assinantes do usuário
│   │   │
│   │   └── lib/
│   │       └── prisma.js           # Singleton do Prisma Client + slow query log + pool config
│   │
│   ├── prisma/
│   │   ├── schema.prisma           # Modelos: User, Transaction, Budget, Goal, CategoryLimit, PushSubscription
│   │   └── migrations/             # Histórico de migrations SQL
│   │       ├── 20260514000000_baseline/
│   │       ├── 20260514000001_add_indexes/
│   │       ├── 20260518000000_add_goals_and_due_day/
│   │       └── 20260519000000_add_reset_token_index/
│   │
│   ├── package.json
│   └── Dockerfile              # Imagem do backend para desenvolvimento (docker compose)
│
└── frontend/
    ├── src/
    │   ├── main.jsx            # Entry point React
    │   ├── App.jsx             # BrowserRouter + lazy routes + PrivateRoute guard
    │   │
    │   ├── pages/              # Componentes de página (carregados sob demanda via lazy)
    │   │   ├── Landing.jsx         # Página inicial (não autenticado)
    │   │   ├── Login.jsx           # Login e registro
    │   │   ├── Dashboard.jsx       # Dashboard principal com métricas e gráficos
    │   │   ├── Transactions.jsx    # Listagem e gestão de transações
    │   │   ├── Analytics.jsx       # Análises por categoria, histórico e assinaturas
    │   │   ├── Goals.jsx           # Metas financeiras
    │   │   ├── Settings.jsx        # Configurações: perfil, salário, contas fixas, notificações
    │   │   ├── Planos.jsx          # Página de planos Free/Pro
    │   │   ├── ForgotPassword.jsx
    │   │   └── ResetPassword.jsx
    │   │
    │   ├── components/
    │   │   ├── features/           # Componentes específicos de domínio
    │   │   │   ├── AgentChat.jsx       # Chat flutuante com agente IA
    │   │   │   ├── TransactionForm.jsx # Formulário de nova transação
    │   │   │   ├── AutoLaunchPrompt.jsx # Banner de lançamento de contas fixas
    │   │   │   ├── InstallBanner.jsx   # Banner de instalação PWA
    │   │   │   └── settings/           # Cards da página de configurações
    │   │   ├── layout/
    │   │   │   └── Navbar.jsx          # Navegação lateral/inferior
    │   │   └── ui/                 # Componentes de UI reutilizáveis
    │   │       ├── CurrencyInput.jsx
    │   │       ├── DateInput.jsx
    │   │       ├── GradCard.jsx
    │   │       ├── UpgradeModal.jsx
    │   │       └── icons.jsx
    │   │
    │   ├── hooks/
    │   │   ├── useUser.js          # Lê/persiste usuário no localStorage com sync entre abas
    │   │   └── useTheme.js         # Toggle dark/light com persistência no localStorage
    │   │
    │   └── services/
    │       ├── api.js              # Axios instance + todas as funções de chamada à API
    │       ├── cache.js            # Cache em memória com TTL (persiste entre navegações)
    │       └── installPrompt.js    # Lógica de instalação PWA (beforeinstallprompt)
    │
    ├── public/                 # Assets estáticos (ícones, manifest.json, sw.js)
    ├── index.html
    ├── vite.config.js          # Build config + proxy /api → backend:3001
    └── package.json
```

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

---

## Deploy (Produção)

A produção roda no **Google Cloud Run** (região `southamerica-east1`). O deploy compila o frontend dentro do Docker e sobe um único container com Express servindo tudo.

```bash
# Garanta que está na raiz do projeto (não em /backend)
npm run deploy

# Equivalente manual:
gcloud run deploy finance-app \
  --source . \
  --region southamerica-east1 \
  --quiet
```

> **Importante:** Sempre rode o deploy a partir da raiz do projeto. O `Dockerfile` raiz faz o build multi-stage (React + Node.js). O `backend/Dockerfile` é apenas para o ambiente de desenvolvimento via docker-compose.

As migrations pendentes são aplicadas automaticamente na inicialização do container (`prisma migrate deploy` no CMD do Dockerfile).

---

## Variáveis de Ambiente

| Variável | Obrigatória | Padrão | Descrição |
|----------|:-----------:|--------|-----------|
| `NODE_ENV` | Sim | `development` | Ambiente de execução |
| `PORT` | Não | `3001` | Porta do Express |
| `DATABASE_URL` | **Sim** | — | Connection string PostgreSQL |
| `JWT_SECRET` | **Sim** | — | Chave secreta JWT (mín. 64 chars) |
| `APP_URL` | Não | — | URL base para links de reset de senha |
| `ALLOWED_ORIGINS` | Prod | — | Origins permitidas no CORS (vírgula) |
| `EMAIL_USER` | Não | — | Gmail para envio de e-mails |
| `EMAIL_PASS` | Não | — | App Password do Gmail |
| `VAPID_PUBLIC_KEY` | Não | — | Chave pública Web Push |
| `VAPID_PRIVATE_KEY` | Não | — | Chave privada Web Push |
| `GROQ_API_KEY` | Não | — | Chave da API Groq (agente IA) |
| `UPGRADE_SECRET` | Não | — | Segredo para ativar plano Pro |
| `MONITOR_SECRET` | Não | — | Segredo do webhook do monitor |
| `MONITOR_COOLDOWN_MINUTES` | Não | `15` | Intervalo mínimo entre alertas push |

Sem `GROQ_API_KEY`, o agente IA retorna 503. Sem `EMAIL_*`, relatórios e reset de senha falham com erro interno mas não derrubam o servidor.

---

## Referência da API

Todas as rotas de API ficam sob `/api/`. Rotas protegidas exigem cookie `token` (JWT).

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
| POST | `/upgrade` | ✓ | Ativa plano Pro (requer `UPGRADE_SECRET`) |
| POST | `/downgrade` | ✓ | Volta para plano Free |

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
| POST | `/monthly-close` | ✓ | Fecha mês: gera PDF, envia e-mail, arquiva transações (Pro only) |
| GET | `/history` | ✓ | Lista meses já fechados |

### Agente IA — `/api/agent`
| Método | Rota | Auth | Descrição |
|--------|------|:----:|-----------|
| POST | `/chat` | ✓ | Chat com assistente financeiro (Groq, model 120B) |
| POST | `/predict` | ✓ | Previsão de encerramento do mês (model 8B, 1 frase) |
| POST | `/monthly-report` | ✓ | Relatório textual do mês gerado por IA |

### Notificações — `/api/notifications`
| Método | Rota | Auth | Descrição |
|--------|------|:----:|-----------|
| GET | `/vapid-public-key` | ✓ | Retorna chave pública VAPID |
| POST | `/subscribe` | ✓ | Salva assinatura Web Push |
| POST | `/unsubscribe` | ✓ | Remove assinatura Web Push |

### Health Check (sem auth)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/ping` | Resposta imediata (mede latência do servidor) |
| GET | `/health` | Status do servidor + DB (cache de 30s, atualizado em background) |

---

## Banco de Dados

**ORM:** Prisma 5 · **Banco:** PostgreSQL (Supabase)

```
User
  ├── id, name, email, password, salary
  ├── plan (free | pro)
  ├── reportEmail, resetToken, resetTokenExpiry
  ├── autoLaunchMonth, autoLaunchYear
  ├── transactions[]
  ├── budgets[]
  ├── categoryLimits[]
  ├── goals[]
  └── pushSubscriptions[]

Transaction
  └── id, description, amount, type, category, date, month, year, archived, userId

Budget
  └── id, name, amount, dueDay, userId

CategoryLimit
  └── id, category, amount, userId  [unique: userId+category]

Goal
  └── id, title, targetAmount, currentAmount, color, deadline, userId

PushSubscription
  └── id, endpoint, p256dh, auth, userId  [unique: endpoint]
```

**Índices:** `Transaction(userId, month, year, archived)`, `Transaction(userId, type, month, year)`, `Budget(userId)`, `Goal(userId)`, `PushSubscription(userId)`, `User(resetToken)`

---

## Segurança

- **JWT** em cookie `httpOnly; secure; sameSite=strict` (24h)
- **bcrypt** (rounds=12) + DUMMY_HASH para prevenir timing attack no login
- **Rate limiting** por IP/userId (auth: 5/15min, agente: 40/hora, geral: 200/15min)
- **Helmet** (CSP, HSTS, X-Frame-Options, etc.) + `Permissions-Policy`
- **`Cache-Control: no-store`** em todas as rotas `/api/`
- **UUID validation** em todos os parâmetros de rota
- **CORS** restrito a origins configuradas em produção
- **SSRF protection** no endpoint de Web Push (whitelist de hosts)
- **`crypto.timingSafeEqual`** para comparação do UPGRADE_SECRET
- **`X-Request-Id`** em todas as respostas para correlação de logs
