# Subida do Nancy 2 para produção — roteiro

> **Para quem:** André (executa) e Tales (acompanha). **Escrito em:** 2026-10-28 (atualizado em 2026-10-29).
> Este roteiro foi preparado a partir da homologação; **nada daqui foi executado em produção**.
> A produção só muda quando a PR `develop → main` é mesclada (o pipeline `deploy.yml` roda sozinho).

## 1. O que vai na subida

- **Visual novo (Nancy 2):** 36 telas redesenhadas, ícone novo (PWA, Android/TWA), aviso de cookies novo.
- **Backend:** exportação "Meus dados" (JSON/CSV), importação de CSV mais tolerante (aceita o próprio export, erros viram 400 em vez de 500), resumo semanal por e-mail em lotes (`jobs/weeklyDigest.js` + `.github/workflows/weekly-digest.yml`), preferências de notificação, foto de perfil, detalhes do pagamento (valor/forma/cartão), verificação de e-mail por código, `weekly-tip-available`.
- **Correções que valem para todos os usuários, inclusive hoje em produção:**
  - **Salário zerado (existe em produção desde 2026-06-22):** o campo "Salário mensal" aparece vazio e "Salvar" vazio zerava o salário avisando "sucesso". Corrigido (campo já vem preenchido; salvar vazio não grava).
  - Onboarding passa a **pular a pergunta de salário** para quem já informou no cadastro (era a intenção do código, que nunca funcionava).
  - **Nancy IA (plano Elite) não exclui nem altera mais nada sem o usuário tocar em "Confirmar"** (antes apagava direto). Rota nova `POST /api/agent/confirm`; o token de confirmação é assinado com uma chave derivada do `JWT_SECRET` que já existe — **não há variável nova**. Trocar o `JWT_SECRET` só invalida confirmações pendentes (vencem em 10 min de qualquer forma).
  - Telas abertas por toque passam a abrir **no topo** (Termos e Privacidade abriam no meio do texto).
- **4 migrações de banco** (todas aditivas — só `ADD COLUMN` com valor padrão/opcional e 1 `CREATE TABLE`):
  `20261021010000_add_email_verify_code`, `20261022120000_add_user_avatar` (tabela `UserAvatar` com RLS), `20261022150000_add_notification_prefs`, `20261022170000_add_payment_details`.
  O código antigo ignora as colunas novas, então **voltar a versão do app não exige desfazer migração**.

## 2. Antes de apertar o botão (pré-voo) — marque tudo

| # | Item | Quem | Como conferir |
|---|------|------|---------------|
| 1 | CI **verde** no último commit da `feature/nancy-2` (Backend, Frontend, Build, E2E) | André | aba Actions → "CI — Testes e Qualidade" |
| 2 | **Homologação rodando exatamente esse commit** e o `scripts/smoke-test.sh` passando nela | André | `scripts/smoke-test.sh https://finance-app-staging-vzcnezphtq-rj.a.run.app` |
| 3 | Rodadas do agente de QA sem achado crítico/alto aberto (ver TESTPLAN.md no repo `nancy-qa-agent`) | André + Claude | relatórios em `nancy-qa-agent/output/` |
| 4 | **Backup manual do banco de produção** (no plano gratuito do Supabase não existe backup automático — ver RELIABILITY.md). O arquivo tem dados dos usuários: guardar fora do computador e **nunca** no repositório (é público) | André | `export PROD_DB_URL='…'` (Supabase → Project Settings → Database → Connection string) e `scripts/backup-prod.sh` (usa Docker, confere o arquivo e recusa pasta dentro do repositório) |
| 5 | Segredos de produção presentes no Cloud Run: `DATABASE_URL, JWT_SECRET, RESEND_API_KEY, CRON_SECRET, MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET, MONITOR_SECRET, UPGRADE_SECRET, ALLOWED_ORIGINS, GROQ_API_KEY, VAPID_*` | André | `gcloud run services describe finance-app --region southamerica-east1` (lista os secrets, sem mostrar valores) |
| 6 | Segredo `CRON_SECRET` também no GitHub Actions (o resumo semanal usa) | André | Settings → Secrets → Actions |
| 7 | **Cota do Resend** comporta o resumo semanal: na 1ª segunda-feira após a subida ele vai para **todos** os usuários existentes (a coluna nasce `true` para quem já existe). A API aceita ~2 envios/s e o job já respeita isso, mas o plano precisa ter volume de e-mails ≥ nº de usuários | André | painel do Resend → plano/limite diário |
| 8 | Decisões pendentes da seção 7 respondidas (principalmente textos jurídicos) | André + Tales | — |
| 9 | Horário: subir **fora do pico** (madrugada/domingo); evitar segunda-feira de manhã (disparo do resumo semanal, 8h) | André | — |

## 3. Subida

1. **Congele**: nenhum outro merge/deploy durante a subida (o pipeline de produção cancela execuções antigas — `concurrency: deploy-production`).
2. Mescle `feature/nancy-2` → `develop` (a homologação sobe sozinha com o código final). Rode o smoke test na homologação de novo e confira o aceite rápido (seção 5).
3. Abra a PR `develop → main` e confira que o CI dela está verde. **Mescle.** O `deploy.yml` roda sozinho:
   `testes → validate-schema → migrate-prod (prisma migrate deploy, ANTES do deploy) → build/deploy Cloud Run → health check ×3 → smoke tests → rollback automático se falhar`.
4. Acompanhe pela aba Actions (≈ 15 min). O job `deploy` usa o ambiente `production` do GitHub.
5. Quando terminar ✅: rode **o smoke test em produção** e o aceite rápido:
   ```bash
   scripts/smoke-test.sh https://finance-app-1042158013294.southamerica-east1.run.app production
   ```
6. Faça o aceite rápido (seção 5) com **uma conta de teste sua**, no celular e no computador.
7. Avise o Tales/usuários só depois do passo 6.

## 4. Rollback (se algo der errado)

Qualquer um destes, do mais simples ao mais completo. **Migrações não precisam ser desfeitas** (são aditivas).

- **Automático:** se o health check ou os smoke tests do pipeline falharem, o próprio `deploy.yml` devolve o tráfego para a revisão anterior.
- **Pelo GitHub (recomendado):** Actions → "CD — Deploy para Cloud Run" → *Run workflow* → `modo: rollback`. Não roda testes, só volta a revisão anterior.
- **Pelo terminal (mais rápido):**
  ```bash
  gcloud run revisions list --service finance-app --region southamerica-east1 --limit 5
  gcloud run services update-traffic finance-app --region southamerica-east1 --to-revisions=<REVISAO_ANTERIOR>=100
  ```
- **Quando decidir voltar:** erro de login/cadastro, tela branca em mais de uma tela, pagamentos falhando, `/health` degradado por mais de 5 min, taxa de erro 5xx claramente acima do normal no Sentry.
- Depois de voltar: abrir um registro do que quebrou (print, horário, revisão) antes de tentar de novo.
- Tela branca em quem já estava com o app aberto: o app recarrega sozinho ao detectar arquivo velho (`lazyWithReload`), e o service worker novo assume na próxima abertura. Pedir "feche e abra o app" resolve o resto.

## 5. Aceite rápido (10 min, conta de teste, celular + computador)

1. Entrar; sair; entrar de novo. Esqueci a senha envia o e-mail.
2. **Início:** saldo, Entradas e Saídas coerentes; stories abrem; sino abre as notificações.
3. **Extrato:** criar saída e entrada; editar (data apagada avisa em português); excluir (a confirmação diz qual); mês passado vazio mostra o texto certo.
4. **Perfil → Finanças:** o **salário vem preenchido**; "Salvar" vazio avisa e não zera; contas fixas: adicionar, marcar como paga (sem duplicar), excluir.
5. **Metas / Parcelados:** criar e pagar uma parcela; criar meta e depositar.
6. **Configurações → Meus dados:** exportar CSV e JSON; importar o CSV exportado.
7. **Cookies:** o aviso aparece, não cobre a barra de baixo, aceitar/recusar funcionam.
8. **PWA:** o ícone novo no celular (reinstalar o app para ver); abrir pelo ícone.
9. **Termos e Privacidade** abrem logado e deslogado.
10. (Se a conta for paga) **Perfil → Pagamentos** mostra o plano e o histórico.
11. **Nancy IA (conta Elite):** "Quanto gastei esse mês?" bate com o Extrato; pedir para excluir uma transação de teste mostra **Confirmar/Cancelar** e o Extrato só muda depois de Confirmar. Abrir Termos pelo Perfil já rolado abre no topo.

## 6. Monitoramento nas primeiras 24 h

- **Agora, a cada 15 min por 1 h, depois de hora em hora:** `scripts/smoke-test.sh <url-prod> production`; `https://…/health` (`db_ms` normal < 600; atenção > 1000).
- **Sentry:** erros novos (filtrar por "first seen" depois do deploy). Nada de 5xx recorrente.
- **Cloud Run (console):** taxa de erro 5xx, latência p95, instâncias (máx. 4), uso de memória (limite 512 MiB — o resumo semanal e a exportação são os pontos de pico).
- **Resend:** entregas/falhas dos e-mails (verificação de e-mail, redefinição de senha, resumo semanal na segunda-feira).
- **Mercado Pago:** um pagamento de teste/real aprovado deve aparecer em "Pagamentos" com valor e forma.
- **Segunda-feira 8h (primeiro resumo semanal):** acompanhar a execução do workflow "Resumo Semanal por E-mail" (Actions) — resposta 200 e quantidade enviada plausível.

## 7. Riscos conhecidos e decisões pendentes

| Tema | Situação | Decisão/ação |
|------|----------|--------------|
| **Latência do banco** | `/health` mede `db_ms` de 490 a 2100 ms em produção e ~600 a 4700 ms em homologação (Supabase da **produção na AWS `us-west-1`, Califórnia** — confirmado em 2026-10-30 pelo endereço IP do banco; o Cloud Run está em `southamerica-east1`, São Paulo, então cada ida ao banco carrega ~180–200 ms só de rede; plano gratuito). **Medido em 2026-10-29 na homologação (que usa o pooler, 1 conexão do Prisma por instância):** cada ida ao banco leva ~0,6 s e o banco atende **uma consulta por vez** por instância — 8 pedidos simultâneos de `/api/goals` terminaram em fila (1º em ~2,5 s, 8º em ~10,4 s). Era a causa dos stories demorarem ~8 s e de o Início (`/dashboard`, ~5 s) ser lento. Os stories foram refeitos para 1 ida ao banco; o resto do app continua sofrendo a fila. | **Resolvido para a subida (2026-10-29):** o log de partida do Cloud Run de **produção** mostra `[Prisma] Conexão direta (connection_limit=3)` — produção NÃO usa o pooler, então não sofre a fila de 1 consulta por vez; **nada a mudar em produção por isso**. A homologação usa o pooler (`connection_limit=1`) e por isso parecia pior do que a produção. Para ela ficar igual à produção, publique-a com `gh workflow run deploy-staging.yml --ref <branch> -f db_connection_limit=3` (medido: 8 pedidos simultâneos de `/api/goals` ≈ 2–3 s, antes até 10,4 s). Sem o campo, o deploy volta ao padrão 1. Outras opções, se um dia a latência incomodar: **aproximar banco e servidor** (mover o projeto do Supabase para `sa-east-1` ou o Cloud Run para `us-west1`; é a maior alavanca, mas é migração e fica para depois da subida), plano pago do Supabase, conferir a região do projeto de homologação. |
| **Sem backup automático do banco** | Risco aceito em RELIABILITY.md; a subida roda migrações. | Backup manual antes (pré-voo #4); avaliar plano com backup diário. |
| **Resumo semanal para todos** | 1ª segunda após a subida envia para todos os usuários existentes. | Conferir cota do Resend (pré-voo #7) ou desligar o padrão antes (virar `false` para existentes) — decidir. |
| **Textos jurídicos** | Termos diz que as assinaturas "renovam automaticamente", mas o app cobra por período e não renova sozinho (os caminhos "Configurações → …" já foram corrigidos para "Perfil → …" e a Privacidade já cita CSV/PDF/JSON). | Revisar a frase da renovação com o Tales antes da subida (recomendação: dizer que o plano **não** renova sozinho e que o botão "Cancelar" vira "Não renovar"). |
| **Lembrete de salário × campo Salário** | A notificação "Seu salário deve cair hoje. Quer registrar?" abre "Nova transação" como Entrada, mas o salário cadastrado já entra nas Entradas (salário + entradas): registrar de novo conta em dobro. | Decisão de produto: mudar o texto/ação do lembrete ou parar de somar o salário cadastrado quando houver entrada "Salário" no mês. |
| **Marcar conta fixa como paga duplica lançamento parecido** | Se a pessoa já lançou "Aluguel" à mão, marcar a conta fixa "Aluguel" como paga cria outro. | Já está no backlog ("redesenho do payBudget"). |
| **Plano Grátis e "Limites"** | O roteiro antigo dizia que Grátis cria limites; no app (e na tabela de planos) é recurso Pro. | Confirmar que a tabela de planos reflete a intenção comercial. |
| **Criar transação com data** | "Nova transação" sempre é de hoje (o endpoint ignora a data); só a edição muda a data. | Possível melhoria futura. |
| **Dependências (npm audit, só produção)** | Frontend: 0 vulnerabilidades. Backend (2026-10-28): 7, todas de negação de serviço ou baixas — `body-parser` (alta, DoS com corpo comprimido), `multer` (alta, DoS com `fileFilter` assíncrono pendente — o app não usa filtro assíncrono), `qs` (moderada, DoS), e 4 baixas via `resend → @react-email/render → html-to-text → deepmerge` (poluição de protótipo em dado que não vem do usuário). Nenhuma permite acesso a dados. | Correção sem quebra existe (`npm audit fix`); o Dependabot já abre as PRs. Não atualizar junto com a subida (uma mudança por vez) — tratar logo depois, com CI verde. |
| **Capturas do manifest** | `manifest.json` ainda aponta capturas da interface antiga. | Trocar por capturas novas (não afeta o funcionamento). |
| **E2E e CI** | O E2E agora roda igual à CI (`scripts/e2e-ci.sh`, container oficial do Playwright), sem esperas por tempo; padrão: 3 rodadas seguidas sem falha nem teste instável antes de cada push. | Pré-voo #1 continua obrigatório. |
| **Minutos do GitHub Actions** | O repositório é público (minutos grátis). Em outubro foram ~2.500 min cobráveis (CI 1.365, deploy de homologação 735, produção 244…). Se o repositório virar **privado**: plano Free tem 2.000 min/mês (estouraria; excedente ≈ US$ 0,008/min); **GitHub Pro (US$ 4/mês)** dá 3.000 min e libera proteção de branch e aprovação manual do ambiente `production`. | Decidir antes de tornar privado; reaproveitar a CI no deploy de homologação (FLUXO_DE_DEPLOY.md, Fase 2) corta ~700 min/mês. |

## 8. Se algo der errado — quem chama quem

1. Reverter (seção 4) **primeiro**, investigar depois.
2. André avisa o Tales com: horário, o que quebrou, se já voltou.
3. Registrar no `CONTEXTO_PROJETO.md` a causa e o que mudar no roteiro.
