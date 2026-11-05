# Portão da homologação

A homologação (`finance-app-staging`) é pública na internet. O portão pede uma senha a quem abre o site, no próprio app
(`backend/src/middleware/stagingGate.js`). Só liga quando existe a variável `STAGING_GATE_KEY`: produção, CI e desenvolvimento
não a definem, então não mudam.

## Como entra
- **Pessoa:** abre o endereço, vê a tela "Homologação do Nancy", digita a senha. O navegador guarda um cookie
  (`staging_gate`, HttpOnly, SameSite=Lax, 30 dias). No celular, uma vez por aparelho.
- **Máquina (agente de QA, scripts):** manda o cabeçalho `x-staging-key: <senha>`. O `scripts/smoke-test.sh` faz isso sozinho se
  a variável de ambiente `STAGING_GATE_KEY` estiver definida.
- **Limite de tentativas:** 10 por 15 minutos por IP em `POST /__gate`.

## O que fica fora do portão (tem segredo próprio)
`/health`, `/api/cron/*` (x-cron-secret), `/api/admin/seed-staging` (x-seed-secret + x-seed-password) e `/api/payments/webhook` (HMAC).

## Onde mora a senha
- Secret Manager do Google Cloud: `STAGING_GATE_KEY` (montada em `deploy-staging.yml`).
- Segredo do GitHub `STAGING_GATE_KEY` (para scripts da CI que precisem do cabeçalho).
- `.env` do agente de QA: `QA_GATE_KEY`.
- Para girar: criar versão nova no Secret Manager, atualizar os outros dois, redeploy da homologação (o cookie antigo deixa de valer).
