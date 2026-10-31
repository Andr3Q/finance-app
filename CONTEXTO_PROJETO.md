# Contexto Completo — Projeto Nancy (FinançasPro)

> Documento gerado em 2026-06-15 para transferência de contexto entre sessões do Claude Code.
> Cole este arquivo inteiro no início de uma nova conversa.

---

## 1. O que é o projeto

**Nancy** é um app de finanças pessoais (antigamente chamado FinançasPro, renomeado para Nancy).

- **URL de produção:** https://myfinancepro.com.br
- **Repositório:** https://github.com/Andr3Q/finance-app (privado)
- **Usuário GitHub:** Andr3Q
- **E-mail do dono:** andre.pereira@mais500.com.br

---

## 2. Stack tecnológica

### Frontend
- React 18 + Vite (PWA — instalável no celular)
- Tema escuro/claro via `[data-theme="light"]` no `<html>`
- CSS customizado em `frontend/src/index.css` (sem Tailwind)
- Fontes: Syne (display) + DM Sans (body)
- Roteamento: react-router-dom v6
- Testes: Vitest + Testing Library (136 testes passando)
- Testes E2E: Playwright

### Backend
- Node.js + Express
- Prisma ORM
- PostgreSQL no **Supabase** (produção na AWS **us-west-1, Califórnia** — confirmado em 2026-10-30 pelo IP do banco; o Cloud Run fica em São Paulo; plano free — pausa após 7 dias sem acesso, **sem backup automático**: backup manual com `scripts/backup-prod.sh` e prova de restauração com `scripts/restore-test.sh`)
- Autenticação JWT

### Infraestrutura
- **Deploy:** Google Cloud Run (southamerica-east1)
- **Projeto GCP:** `financaspro-2024`
- **DNS:** Cloudflare (proxy ativado)
- **CI/CD:** GitHub Actions
- **Secrets:** GCP Secret Manager + GitHub Actions Secrets

---

## 3. Variáveis CSS importantes

O projeto NÃO tem `--s1`, `--s2`, `--s3` no `:root`. Variáveis que existem:

```
--bg, --bg-card, --bg-secondary
--t1, --t2, --t3
--bd, --bdbd
--c (cor primária = #4ae2ac, verde/teal)
--red, --green
```

Classes CSS do projeto:
- `.modal`, `.modal-overlay` — modal padrão (`.modal { background: #1a1a1a }`)
- `.dsb-topbar`, `.dsb-sidebar`, `.dsb-mobile-nav` — layout principal
- `.hb-topbar`, `.hb-mobile-only` — header mobile do Dashboard
- `.del-modal`, `.del-modal-bar`, `.del-modal-inner`, `.del-modal-btns` — modal de exclusão de conta
- `.dsb-bell-wrap`, `.dsb-bell-btn`, `.dsb-bell-dot`, `.dsb-bell-drop` — sino de notificações

---

## 4. Arquivos principais

```
finance-app/
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx       ← header mobile com sino + busca + tema
│   │   │   ├── Settings.jsx        ← modal de exclusão de conta redesenhado
│   │   │   ├── Login.jsx
│   │   │   ├── Transactions.jsx
│   │   │   └── Goals.jsx
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   └── Navbar.jsx      ← sidebar desktop + topbar desktop + bottom nav mobile
│   │   │   └── features/
│   │   │       └── PlanExpiryBanner.jsx   ← banner expiração plano (trial foi pro sino)
│   │   ├── utils/
│   │   │   ├── format.js
│   │   │   └── notifications.js    ← playSoftChime, getTrialNotif, getSalaryNotif
│   │   ├── services/
│   │   │   ├── api.js
│   │   │   ├── analytics.js
│   │   │   └── cache.js
│   │   ├── hooks/
│   │   │   ├── useUser.js
│   │   │   └── useTheme.js
│   │   └── index.css               ← todos os estilos
│   └── e2e/
│       ├── helpers/
│       │   ├── session.js          ← injectSession(page, user)
│       │   └── mockApi.js          ← createMock(page), TX_EXPENSE, TX_INCOME, GOAL_ITEM
│       └── *.spec.js
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── server.js
│   └── prisma/
│       └── schema.prisma
└── .github/
    └── workflows/
        ├── ci.yml          ← testes em todo PR/push
        ├── deploy.yml      ← CD para Cloud Run (input: modo = deploy|rollback|deploy-skip-e2e)
        ├── keepalive.yml   ← ping diário para não pausar o Supabase
        └── staging.yml     ← deploy em ambiente de staging
```

---

## 5. GitHub Actions — pontos críticos

### Deploy rápido (sem Playwright, ~6 min)
```bash
gh workflow run "CD — Deploy para Cloud Run" \
  --repo Andr3Q/finance-app \
  --field modo=deploy-skip-e2e
```
> O campo se chama `modo` (não `mode` nem `deploy_mode`).

### Deploy completo (~13-15 min)
Basta fazer `git push origin main` — o CD dispara automaticamente.

### Keep-alive do Supabase
O arquivo `keepalive.yml` roda todo dia às 12h UTC fazendo curl no `/health`. Isso evita que o Supabase pause o banco (ele pausa após 7 dias sem acesso no plano free).

### Proteção de branch (main)
Desde 07/08, `main` exige 1 aprovação de PR antes de mergear (`enforce_admins: false` — dono e colaboradores com permissão de admin podem usar merge de override quando necessário, ex: `gh pr merge <n> --admin`).

---

## 6. Funcionalidades implementadas (histórico recente)

### Sino de notificações
- **Desktop:** já existia na `Navbar.jsx` (topbar direita)
- **Mobile:** adicionado no header do `Dashboard.jsx` (entre botão de tema e busca)
- Notificações: lembrete de salário (5º dia útil do mês) + aviso de trial Pro
- Som suave (Web Audio API) ao aparecer notificação de trial (C5 + E5, volume 0.07)
- Funções em `frontend/src/utils/notifications.js` (compartilhado entre Navbar e Dashboard)

### Trial notification
- Antes ficava num banner amarelo no topo (foi removido)
- Agora aparece no sino com ponto vermelho + som suave
- Implementado em: `Navbar.jsx` (desktop) e `Dashboard.jsx` (mobile)

### Modal "Excluir conta permanentemente" (Settings.jsx)
- Redesenhado completamente — antes estava feio
- Usa classes `.modal-overlay` + `.modal del-modal`
- Barra vermelha no topo, lista do que será excluído, campo de senha
- Responsivo no mobile: bottom sheet, botões empilhados, `safe-area-inset-bottom`
- Light mode: `[data-theme="light"] .del-modal { background: #ffffff }`
- **IMPORTANTE:** O projeto NÃO tem `--s1` — usar `className="modal"` que já tem `background: #1a1a1a`

---

## 7. Regras de desenvolvimento

1. **Sempre responder em português**
2. **Toda feature deve funcionar em 4 contextos:** dark mode, light mode, desktop, mobile
3. **CSS:** ao escrever estilo novo, sempre adicionar override `[data-theme="light"]`
4. **Testes:** 136 testes Vitest passando — rodar `npm run test:run` antes de fazer push
5. **Modal:** nunca usar `var(--s1)` — não existe no projeto. Usar `className="modal"` ou cor explícita
6. **E2E Playwright:** usar status 400 (não 401) para erros de auth em testes — 401 dispara redirect

---

## 8. Testes E2E — armadilhas conhecidas

- **Strict mode:** `getByText(/regex/)` pode bater em múltiplos elementos → usar `.first()` ou texto exato
- **callCount em routes:** instável — requests extras (dashboard, subscriptions) incrementam o contador
- **axios interceptor 401:** qualquer mock 401 dispara `window.location.href='/login'` → usar 400
- **Botão de remover:** há dois botões com a mesma classe → usar `[title="Remover"]`
- **Toast "Depósito registrado!"** — não contém "depositado/sucesso/atualizado"
- **Splash por cima de tudo:** o vídeo de abertura (`#app-splash`, ~4 s a cada carga) cobre a tela inteira — `elementFromPoint` devolve o `<video>` e o clique/medição vai para o lugar errado. Espere `#app-splash` ficar oculto antes de medir ou clicar por coordenada.
- **Flag "já teve conta" em init script:** `addInitScript(() => localStorage.setItem('nancy_has_account','1'))` recoloca a flag a CADA recarga; com sessão expirada o app apaga a flag e recarrega para o login, o init script a recoloca e a abertura entra em loop de reload. Coloque a flag só no primeiro carregamento (guarde um marcador na `sessionStorage`).

---

## 9. Infraestrutura GCP

- **Projeto GCP:** `financaspro-2024` — NÃO alterar este ID
- **Região:** `southamerica-east1` (São Paulo)
- **Serviço Cloud Run:** `finance-app-1042158013294.southamerica-east1.run.app`
- **Secrets no GCP Secret Manager:** `DATABASE_URL`, `MONITOR_SECRET`, `CRON_SECRET`
- **DATABASE_URL:** aponta para Supabase em `db.xatcxuzcxncouhreopnf.supabase.co`
- O endpoint `/api/monitor/*` é protegido pelo `MONITOR_SECRET`
- O endpoint `/api/cron/*` é protegido pelo `CRON_SECRET` — disparado 1x/dia pelo GitHub Actions (`plan-reminders.yml`) pra varrer lembretes de vencimento de trial/plano

---

## 10. Notion — documentação criada

- **Estudo do Nancy** (CI/CD): https://app.notion.com/p/37d1f3e8d06d81d9bafecf13cde01a88
- **Nancy — Do zero ao deploy**: https://app.notion.com/p/37d1f3e8d06d81798a11e8fcd9c8875c

---

## 11. Estado atual (2026-08-07)

- Branch main atualizado e limpo, deploy de produção confirmado saudável (`/health` ok)
- Auditoria de QA em profundidade concluída: 5 bugs de negócio corrigidos e testados
  (gate de plano do chat IA, plano efetivo em budget.js, parsing de decimal no
  import de CSV, transação órfã em desfazer parcelamento, atomicidade do
  contador anti-brute-force)
- Bug do microfone do AgentChat resolvido — causa raiz era o header
  `Permissions-Policy: microphone=()` no servidor, que sobrepunha qualquer
  permissão concedida pelo usuário no navegador
- 7 vulnerabilidades de segurança do Dependabot corrigidas (axios, brace-expansion
  x2, undici, postcss, dompurify, body-parser) + upgrade major de
  react-router-dom (6.30.4 → 7.18.1), validado com CI completo e staging real
- Pendências conhecidas: bug no `staging.yml` (falta `STAGING_SEED_SECRET` no
  env do workflow — bloqueado por falta do escopo `workflow` no token), 8
  achados de severidade média da auditoria ainda não corrigidos, melhoria de
  transcrição de voz (Whisper via Groq) ainda não decidida
- Redesign completo ("Liquid Aurora v4") está na branch `feature/redesign-nancy` aguardando design final da esposa (telas + hexadecimais)

---

## 12. Colaboradores

- **Andr3Q** — dono (read/write)
- **Gabriel-RdS** — colaborador (read)
