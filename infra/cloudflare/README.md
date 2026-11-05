# Worker do Cloudflare (proxy do myfinancepro.com.br)

O domínio aponta (AAAA `100::`, com proxy) para o Worker `bold-haze-b815`, que repassa as requisições ao Cloud Run.
O código está em `worker.js` (este arquivo é a fonte; o painel do Cloudflare só recebe uma cópia).

## Segredo EDGE_SECRET
- App: segredo `EDGE_SECRET` no Secret Manager, montado em `deploy.yml` (`--set-secrets ... EDGE_SECRET=EDGE_SECRET:latest`).
- Worker: segredo com o MESMO valor, em Workers e Pages > bold-haze-b815 > Configurações > Variáveis e segredos (tipo Segredo, nome `EDGE_SECRET`).
- Para girar: criar uma versão nova no Secret Manager, atualizar o segredo do Worker com o mesmo valor, depois redeploy do app. Durante a troca o app usa o IP antigo (req.ip), sem quebrar.

## Como conferir que está funcionando
Pelo domínio, o contador `RateLimit-Remaining` deve descer de 1 em 1 numa rota repetida (ex.: `GET /api/__teste__`);
antes do Passo A ele variava (199, 199, 198, 197, 199) porque cada requisição chegava com um "IP" diferente.

## Desfazer
No painel do Worker, aba Implantações/Versões, voltar à versão anterior (um clique). O app aceita as duas situações.
