#!/usr/bin/env bash
# Roda o E2E EXATAMENTE como a CI: a imagem oficial do Playwright (Ubuntu 24.04, mesmo Chromium e mesmas fontes), com
# CI=true (2 processos, 1 repetição, servidor novo). É o jeito de saber aqui, ANTES do push, o que a CI vai dizer.
#
# Por que existe: este computador roda Ubuntu 26.04, que o Chromium do Playwright ainda não suporta — por isso o E2E
# "local" usava o Chrome do sistema, um navegador diferente do da CI (texto que cabia numa linha aqui quebrava lá).
#
# Uso (os argumentos vão direto para o `playwright test`):
#   scripts/e2e-ci.sh                                   # suíte completa (~13 min)
#   scripts/e2e-ci.sh e2e/tests/security.spec.js        # um arquivo
#   scripts/e2e-ci.sh -g "layout do design"             # por nome
#   scripts/e2e-ci.sh --repeat-each=3                   # estabilidade: cada teste 3 vezes
#
# Resultado:  exit 0 = tudo passou, SEM nenhum teste instável  ·  1 = falhou  ·  3 = passou só na repetição (instável)
#
# Rodada LIMPA — cada execução deixa o caminho livre para a próxima:
#   antes:  remove container e resultados da rodada anterior; com pouco espaço (<2 GB), limpa o que não está em uso.
#   depois: o container é sempre removido (inclusive com Ctrl-C ou erro); se passou, apaga test-results/ e
#           playwright-report/ (nada sobra); se falhou, mantém só o necessário para diagnosticar (a próxima rodada limpa).
# A imagem do Playwright (~3,4 GB, baixada uma vez) é a única coisa que fica: é a ferramenta.
set -uo pipefail
cd "$(dirname "$0")/.."

NOME="nancy-e2e-ci"
LOG="$(mktemp -t nancy-e2e-ci.XXXXXX)"
command -v docker >/dev/null || { echo "❌ Docker não encontrado."; exit 1; }

limpar_container() { docker rm -f "$NOME" >/dev/null 2>&1 || true; }

finalizar() {
  local codigo=$?
  limpar_container
  if [ "$codigo" -eq 0 ]; then
    rm -rf test-results playwright-report
    echo "🧼 Tudo passou: relatórios e capturas removidos, container removido (nada sobrou)."
  else
    mkdir -p test-results && cp "$LOG" test-results/e2e-ci.log 2>/dev/null || true
    echo "📎 Não passou: mantive test-results/ e playwright-report/ para diagnosticar (a próxima rodada limpa)."
  fi
  rm -f "$LOG"
  docker builder prune -f >/dev/null 2>&1 || true
  echo "💾 Espaço livre: $(df -h --output=avail / | tail -1 | tr -d ' ')"
  exit "$codigo"
}
trap finalizar EXIT
trap 'exit 130' INT TERM

# ── antes: caminho limpo ─────────────────────────────────────────────────────────────────────────────────────────────
limpar_container
rm -rf test-results playwright-report
LIVRE_GB="$(df -BG --output=avail / | tail -1 | tr -dc '0-9')"
if [ "${LIVRE_GB:-0}" -lt 2 ]; then
  echo "🧹 Pouco espaço livre (${LIVRE_GB} GB): limpando o que não está em uso..."
  scripts/limpar-espaco.sh --aplicar || true
fi

VERSION="$(node -p "require('@playwright/test/package.json').version")"
IMAGE="mcr.microsoft.com/playwright:v${VERSION}-noble"
docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo "⬇️  Baixando $IMAGE (uma vez só)..."; docker pull "$IMAGE" || exit 1; }

# ── a rodada ─────────────────────────────────────────────────────────────────────────────────────────────────────────
echo "▶ E2E no container $IMAGE (CI=true)"
docker run --rm --name "$NOME" --ipc=host -u "$(id -u):$(id -g)" -e CI=true -e HOME=/tmp \
  -v "$PWD":/work -w /work "$IMAGE" npx playwright test "$@" 2>&1 | tee "$LOG"
CODIGO="${PIPESTATUS[0]}"

# Passou só na repetição = teste instável: para o nosso padrão (nunca falhar) isso também reprova.
if [ "$CODIGO" -eq 0 ] && sed 's/\x1b\[[0-9;]*m//g' "$LOG" | grep -Eq '^\s+[0-9]+ flaky'; then
  echo "⚠️  Há teste(s) INSTÁVEL(is) (passaram só na repetição). Isto reprova a rodada: corrija a causa."
  CODIGO=3
fi
exit "$CODIGO"
