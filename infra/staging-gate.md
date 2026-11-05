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

## Onde mora a senha (e onde NUNCA pode estar)
- **Pode:** Secret Manager do Google Cloud (`STAGING_GATE_KEY`, montada em `deploy-staging.yml`), o `.env` do agente de QA
  (`QA_GATE_KEY`; o `.env` é ignorado pelo git) e o gerenciador de senhas do dono.
- **Nunca:** no repositório (nenhum arquivo, nenhum commit) e **nem como segredo do GitHub**. Decisão do dono. O teste
  `noSeedCredentialsInRepo.test.js` barra as duas coisas.
- Scripts que precisarem da senha (ex.: `scripts/smoke-test.sh`) a recebem pela variável de ambiente `STAGING_GATE_KEY` na máquina de quem roda.
- Para girar: criar versão nova no Secret Manager, atualizar o `.env` do agente de QA e o gerenciador de senhas, e redeploy da
  homologação (o cookie antigo deixa de valer).
