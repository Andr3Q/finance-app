# Scripts legados (referência histórica)

Estes arquivos **não fazem parte da pipeline de deploy atual**. O deploy de produção e staging hoje é 100% automatizado via GitHub Actions (`.github/workflows/deploy.yml` e `deploy-staging.yml`) — eles não chamam nenhum arquivo desta pasta.

- **`deploy.sh`** — script de deploy manual pro Cloud Run (build → deploy com 0% de tráfego → health check → rollout gradual 10%/50%/100% → rollback automático em falha). Usado antes da automação via GitHub Actions. Mantido aqui só como referência histórica; não foi testado contra a estrutura atual do projeto.
- **`cloudbuild.yaml`** — configuração do Cloud Build pra `gcloud run deploy --source .`, um método de build diferente do que a pipeline atual usa (que builda a imagem Docker direto no runner do GitHub Actions).

Se precisar de um deploy manual de emergência de verdade, confira antes se a lógica desses scripts ainda é compatível com o setup atual (secrets, variáveis de ambiente, nome do serviço) — eles não são mantidos ativamente.
