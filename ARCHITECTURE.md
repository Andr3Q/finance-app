# Arquitetura do Nancy

> **Decisão:** Layered Architecture (Arquitetura em Camadas) com princípios do Clean Architecture.  
> **Data:** 2026-05-26 | **Autor:** Arquiteto de Software Sênior

---

## Por que Arquitetura em Camadas?

| Critério | Layered | DDD Completo | Monolito |
|----------|---------|-------------|----------|
| Curva de aprendizado | ✅ Baixa | ❌ Alta | ✅ Baixa |
| Adequação para Express.js | ✅ Natural | ⚠️ Forçado | ✅ Natural |
| Testabilidade | ✅ Alta | ✅ Alta | ❌ Baixa |
| Escalabilidade futura | ✅ Boa | ✅ Excelente | ❌ Ruim |
| Risco de migração | ✅ Baixo | ❌ Alto | — |

**Decisão:** Layered Architecture é o ponto de equilíbrio ideal para este projeto — mais rigorosa que um monolito puro, mais pragmática que DDD completo.

---

## Estrutura de Camadas (Backend)

```
┌─────────────────────────────────────────────────────┐
│  interfaces/http/           ← Camada HTTP            │
│  ┌─────────────┐  ┌───────────────┐  ┌───────────┐  │
│  │  routes/    │  │ controllers/  │  │middleware/│  │
│  └─────────────┘  └───────────────┘  └───────────┘  │
└───────────────────────┬─────────────────────────────┘
                        │ chama
┌───────────────────────▼─────────────────────────────┐
│  application/          ← Camada de Aplicação         │
│  ┌──────────────────────────────────────────────┐   │
│  │  *Service.js  (casos de uso / orquestração)  │   │
│  └──────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────┘
                        │ chama
┌───────────────────────▼─────────────────────────────┐
│  infrastructure/       ← Camada de Infraestrutura    │
│  ┌──────────────────────────────────────────────┐   │
│  │  repositories/ (acesso ao banco via Prisma)  │   │
│  └──────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────┘
                        │ usa
┌───────────────────────▼─────────────────────────────┐
│  domain/               ← Camada de Domínio           │
│  ┌──────────────┐  ┌─────────────────────────────┐  │
│  │  entities/   │  │  errors/                    │  │
│  │  (regras de  │  │  (AppError, ValidationError,│  │
│  │  negócio)    │  │   NotFoundError, etc.)      │  │
│  └──────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Regras de Dependência

> ⚠️ **Regra de Ouro:** dependências só apontam para DENTRO (em direção ao domínio).

| Camada | Pode importar | NÃO pode importar |
|--------|--------------|-------------------|
| `interfaces/http` | `application`, `domain/errors`, `middleware` | `infrastructure` diretamente |
| `application` | `domain`, `infrastructure/repositories` | `express`, `req`, `res` |
| `infrastructure` | `domain`, `lib/prisma` | `application`, `interfaces` |
| `domain` | Nada externo | Qualquer outra camada |

---

## Estrutura de Pastas

```
backend/src/
├── domain/                    # Regras de negócio puras
│   ├── entities/              # Entidades com validação e regras
│   │   └── Goal.js            ← REFERÊNCIA: padrão para todas as entidades
│   └── errors/                # Hierarquia de erros de domínio
│       ├── AppError.js        # Base
│       ├── ValidationError.js # 400
│       ├── NotFoundError.js   # 404
│       ├── ForbiddenError.js  # 403
│       └── ConflictError.js   # 409
│
├── application/               # Casos de uso (orquestração)
│   └── goals/
│       └── GoalService.js     ← REFERÊNCIA: padrão para todos os serviços
│
├── infrastructure/            # Detalhes de implementação
│   └── repositories/
│       └── GoalRepository.js  ← REFERÊNCIA: padrão para todos os repositórios
│
├── interfaces/
│   └── http/
│       ├── controllers/
│       │   └── GoalController.js  ← REFERÊNCIA: controller thin
│       ├── routes/
│       │   └── goals.js           ← REFERÊNCIA: apenas registra handlers
│       └── middlewares/
│           └── errorHandler.js    ← Handler centralizado de erros
│
├── middleware/                # Middleware HTTP existente (mantido)
│   ├── auth.js
│   └── rateLimiter.js
│
├── routes/                    # LEGADO — sendo migrado gradualmente
│   ├── auth.js       ← próximo a migrar
│   ├── transactions.js
│   └── ...
│
├── services/                  # Serviços externos (email, PDF, push)
│   ├── emailService.js
│   ├── pdfService.js
│   └── pushService.js
│
├── lib/
│   └── prisma.js              # Cliente Prisma com retry
└── utils/
    └── constants.js           # Constantes compartilhadas
```

---

## Estrutura de Pastas (Frontend)

```
frontend/src/
├── pages/          # Componentes de rota — finos, compostos por hooks + features
├── components/
│   ├── features/   # Lógica de UI complexa por domínio
│   ├── layout/     # Estrutura (Navbar, etc.)
│   └── ui/         # Componentes puramente apresentacionais
├── hooks/          # Estado e lógica reutilizável
│   ├── useUser.js
│   ├── useTheme.js
│   └── useGoals.js ← REFERÊNCIA: padrão para todos os hooks de domínio
├── services/       # Acesso externo (API, analytics, cache)
│   └── api.js      # Cliente HTTP centralizado
├── constants/      # Valores estáticos
└── utils/          # Funções puras
```

---

## Como criar um novo domínio

### Backend (siga esta ordem):
1. **`domain/errors/`** — reuse as classes existentes (ValidationError, NotFoundError, etc.)
2. **`domain/entities/NovaDomain.js`** — adicione `validateCreate()`, `validateUpdate()`, regras de negócio
3. **`infrastructure/repositories/NovaDomainRepository.js`** — apenas Prisma, sem lógica de negócio
4. **`application/novaDomain/NovaDomainService.js`** — orquestre entity + repository
5. **`interfaces/http/controllers/NovaDomainController.js`** — apenas req/res → service → res
6. **`interfaces/http/routes/novaDomain.js`** — apenas `router.get/post/patch/delete`
7. **`server.js`** — adicione o require da nova rota

### Frontend (siga esta ordem):
1. **`hooks/useNovaDomain.js`** — fetch, cache, mutações
2. **`components/features/NovaDomainCard.jsx`** — UI do domínio
3. **`pages/NovaDomain.jsx`** — compose hooks + components (página fina)

---

## Convenções de Erros

```js
// ✅ CORRETO — lança erro de domínio no Service
throw new ValidationError('Título é obrigatório.', 'title')
throw new NotFoundError('Meta')
throw new ForbiddenError('Limite atingido.', { limitReached: true, plan: 'free' })

// ✅ CORRETO — Controller repassa para errorHandler via next(err)
async create(req, res, next) {
  try {
    const result = await goalService.create(req.userId, req.body)
    res.status(201).json(result)
  } catch (err) {
    next(err)  // ← errorHandler centralizado cuida do resto
  }
}

// ❌ ERRADO — res.status() dentro do Service (viola separação de camadas)
// ❌ ERRADO — try/catch com res.status(400) dentro da rota
```

---

## Segurança — armadilhas conhecidas

> ⚠️ **`Permissions-Policy` do microfone deve ficar em `microphone=(self)`, nunca `microphone=()`.**
> `backend/src/server.js` manda esse header em toda resposta. Allowlist vazia (`()`) desabilita a API
> de microfone incondicionalmente — inclusive para o próprio site — e esse header tem prioridade
> sobre qualquer permissão que o usuário conceda manualmente no navegador. Isso já quebrou o registro
> por voz do `AgentChat` em produção (incidente de 2026-08, ver `CONTEXTO_PROJETO.md`) e é o tipo de
> coisa que um "enrijecimento de segurança" genérico (ex: copiar um exemplo de CSP/Permissions-Policy
> de outro projeto que bloqueia tudo por padrão) reintroduz sem ninguém perceber até o próximo bug
> report. Protegido por teste em `backend/__tests__/security.test.js` — se for alterar esse header,
> rode esse teste primeiro.

---

## Migração dos domínios legados

| Domínio | Arquivo atual | Status |
|---------|--------------|--------|
| **Goals** | `routes/goals.js` | ✅ Migrado — referência |
| Auth | `routes/auth.js` | 🔄 Próximo |
| TwoFactor | `routes/twoFactor.js` | 🔄 Fila |
| Transactions | `routes/transactions.js` | 🔄 Fila |
| Installments | `routes/installments.js` | 🔄 Fila |
| Budget | `routes/budget.js` | 🔄 Fila |
| Payments | `routes/payments.js` | 🔄 Fila |
| Reports | `routes/reports.js` | 🔄 Fila |
| Notifications | `routes/notifications.js` | 🔄 Fila |
| Monitor | `routes/monitor.js` | 🔄 Fila |
| Agent | `routes/agent.js` | 🔄 Fila |

> **Estratégia de migração:** Um domínio por sprint. Os testes E2E existentes garantem que a API não quebra durante a migração (contratos HTTP permanecem idênticos).
