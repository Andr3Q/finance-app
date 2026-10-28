# Fluxo de testes e deploys — diagnóstico e plano de melhoria

> Escrito em 2026-10-28. Os números vêm do histórico do GitHub Actions (últimas execuções).
> **Nada deste plano foi aplicado ainda**; cada fase diz o que muda, o ganho, o risco e como validar.

## 1. Como está hoje

| Etapa | O que roda | Tempo típico |
|---|---|---|
| **CI** (todo push fora da `main`) | Backend (Jest) ‖ Frontend (Vitest) ‖ Build → **só depois** E2E (Playwright, 1 job, ~300 testes) | ~15 min |
| **Deploy de homologação** (`develop` ou botão) | **repete tudo**: Backend, Frontend, Build, E2E → migração → build/deploy → seed → health | ~18 min (média de 23 deploys ok) |
| **Deploy de produção** (`main`) | testes de novo → validação do schema → migração → deploy → health ×3 → smoke → rollback automático | ~18 min (19 deploys ok, **0 falhas**) |

Histórico: CI **43 ok / 6 falhas / 11 cancelados** (de 60); deploys de homologação **23 ok / 5 falhas / 2 cancelados**; produção **19 ok / 0 falhas**.
A produção é estável. O atrito está no caminho até ela: testes frágeis e trabalho repetido.

## 2. Onde o tempo é perdido

1. **Os testes rodam duas vezes** (CI e depois o deploy), com ~12 min de E2E cada. Uma falha intermitente em qualquer uma barra o deploy, mesmo com a outra verde — é o dobro de chance de azar.
2. **O E2E é um job só** (não é dividido) e **espera os testes unitários terminarem** antes de começar, sem precisar deles.
3. **Feedback local lento e diferente da CI:** a bateria completa leva ~20 min no computador, a configuração local nem está no repositório e roda sem a repetição que a CI tem. Falha local e falha da CI não significam a mesma coisa.
4. **Testes frágeis:** esperas fixas (`waitForTimeout`), dependência de tempo real e de rolagem suave. Passam sozinhos e falham sob carga. Não há relatório de testes instáveis.
5. **Nada confirma "o que está no ar":** depois do deploy, conferir se o commit certo subiu foi manual (comparar nomes de arquivos do build).
6. **Produção:** o tráfego muda para a revisão nova **antes** do smoke test (se a revisão estiver ruim, usuários a veem até o rollback automático); o smoke é mínimo (6 URLs); não há backup antes da migração; o ambiente `production` não exige aprovação.

## 3. Plano em fases

### Fase 1 — Testes confiáveis e rápidos (sem efeito em produção)
| # | Mudança | Ganho | Risco |
|---|---|---|---|
| 1a | **Configuração local no repositório**, igual à da CI (repetição 1, trace na repetição), e dois comandos: `verify:fast` (testes unitários relacionados ao que mudou + specs E2E relacionados + build, ~3 min) e `verify:full` (tudo). | Falha local = falha da CI; feedback em minutos | Nenhum |
| 1b | **Caçar testes frágeis:** trocar esperas fixas por esperas pelo estado real (começando pelas setas dos atalhos), proibir `waitForTimeout` em teste novo (checagem automática no `verify`), reportar testes que precisaram de repetição. | Fim das falhas "passa sozinho" | Baixo (só testes) |
| 1c | **CI mais rápida:** E2E dividido em 4 partes em paralelo (`--shard`), rodando junto com os unitários (não depois). Rótulos com contagem fixa ("201 testes") viram genéricos. | CI de ~15 min para ~6 min | Baixo (CI só valida) |

### Fase 2 — Deploy de homologação sem repetir trabalho
| # | Mudança | Ganho | Risco |
|---|---|---|---|
| 2a | O deploy **reaproveita o resultado da CI do mesmo commit**: se a CI está verde, pula os testes; se não existe, roda tudo como hoje. | De ~18 min para ~5–6 min depois da CI verde | Baixo (cai no comportamento atual se não achar a CI) |
| 2b | **Carimbo de versão:** o build recebe o SHA do commit e o `/health` passa a devolvê-lo; o deploy confere que a revisão nova serve exatamente aquele SHA. | Certeza de "o que está no ar" | Baixo |
| 2c | O deploy roda `scripts/smoke-test.sh` no fim (já existe e foi validado) e confere o seed (login da Alice, contas fixas). | Homologação nunca fica "no ar mas quebrada" | Baixo |

### Fase 3 — Produção mais segura (**precisa da sua aprovação**, mexe no pipeline de produção)
| # | Mudança | Ganho | Risco |
|---|---|---|---|
| 3a | **Revisão "canário":** publicar com `--no-traffic --tag canary`, rodar o smoke contra a URL do canário e só então mover o tráfego (opcional: 10% → 100%). Mantém o rollback automático. | Usuário nunca vê uma revisão ruim | Médio: mexe no `deploy.yml`; validar antes na homologação |
| 3b | **Backup antes da migração** (`pg_dump` para um bucket privado) e **checagem de migração destrutiva** (`DROP`, `ALTER TYPE`, etc. reprovam o pipeline). | Volta atrás em dados, que hoje não existe | Médio (infra nova) |
| 3c | **Aprovação manual no ambiente `production`** e proteção de branch exigindo CI verde. | Ninguém sobe produção por engano | Depende do plano do GitHub (repositório privado exige plano pago) |
| 3d | **Vigia pós-deploy** por 10–15 min (health + smoke a cada minuto; rollback automático se falhar). | Pega erro tardio | Baixo |

**Ensaio obrigatório:** toda mudança da Fase 3 é feita **primeiro no deploy de homologação** (mesmos comandos, serviço de homologação), observada funcionando, e só depois portada para produção — e entra em produção como mudança **separada** da subida do Nancy 2 (uma mudança por vez).

## 4. Ordem proposta
1. Terminar o lote atual do celular (bateria completa verde → push → CI → homologação).
2. **Fase 1** inteira (é a que mais devolve tempo e tira o atrito).
3. **Fase 2** (testada na homologação).
4. Subir o Nancy 2 com o fluxo já melhorado.
5. **Fase 3**, com sua aprovação, em outra janela.

## 5. Regras de bolso enquanto isso
- Mudança em algo compartilhado (hook, componente comum, CSS global): procurar todos os usos e rodar os testes deles **antes** do commit.
- Um assunto por push; push só com a bateria completa local verde; conferir a CI depois do push, antes de dizer "pronto".
- Teste que falha sem motivo: corrigir a causa (espera por estado, não por tempo); nunca só repetir.
