#!/usr/bin/env bash
# Libera espaço em disco SÓ com o que não está em uso e dá para recriar. Por padrão apenas MOSTRA o que removeria
# (e quanto); com --aplicar remove de verdade.
#
#   scripts/limpar-espaco.sh            # simulação: lista o que seria removido
#   scripts/limpar-espaco.sh --aplicar  # remove
#
# O que limpa (tudo regenerável):
#   1. Docker: imagens SEM nenhum container (parado ou não), imagens sem nome e cache de build.
#      A imagem do Playwright é protegida (é a que roda o E2E igual à CI).
#   2. Caches: npm, Chrome/Chrome headless, Electron, Gradle (só o cache; as distribuições ficam).
#   3. Do projeto: build do frontend (dist/), relatórios e falhas do Playwright, e capturas/vídeos de QA com
#      mais de 3 dias (os relatórios .md ficam).
#   4. Downloads: SÓ instaladores (.deb .AppImage .rpm .iso .exe .msi .dmg) com mais de 60 dias.
# O que NUNCA toca: containers, volumes do Docker (podem ter dados), imagens usadas por algum container, documentos,
# fotos, código e qualquer arquivo seu fora das categorias acima.
set -uo pipefail

APLICAR=0; [ "${1:-}" = "--aplicar" ] && APLICAR=1
cd "$(dirname "$0")/.."
ROOT="$PWD"
QA_OUT="$HOME/projetos/nancy-qa-agent/output"
KEEP_IMAGES='^mcr\.microsoft\.com/playwright'

e2e_rodando() { docker ps --format '{{.Image}}' 2>/dev/null | grep -Eq "$KEEP_IMAGES" || pgrep -f "[p]laywright test" >/dev/null 2>&1; }

livre() { df -B1 --output=avail / | tail -1 | tr -d ' '; }
hum()   { numfmt --to=iec --suffix=B "${1:-0}" 2>/dev/null || echo "${1:-0}B"; }
ANTES="$(livre)"; TOTAL=0

tamanho() { du -sb "$@" 2>/dev/null | awk '{s+=$1} END {print s+0}'; }
item() { # descrição, tamanho em bytes
  [ "${2:-0}" -gt 0 ] || return 0
  printf "  %-62s %8s\n" "$1" "$(hum "$2")"; TOTAL=$((TOTAL + $2))
}

echo "Espaço livre agora: $(hum "$ANTES")"; [ "$APLICAR" = 1 ] && echo "Modo: REMOVER" || echo "Modo: simulação (use --aplicar para remover)"
echo

# 1) Docker ---------------------------------------------------------------------------------------------------------
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "Docker"
  unused_ids=()
  while read -r id repo tag; do
    ref="$repo:$tag"; [ "$repo" = "<none>" ] && ref="$id"
    echo "$ref" | grep -Eq "$KEEP_IMAGES" && continue
    [ -z "$(docker ps -a -q --filter "ancestor=$id")" ] || continue          # algum container usa: não mexe
    size="$(docker image inspect "$id" --format '{{.Size}}' 2>/dev/null || echo 0)"
    item "imagem sem container: $ref" "$size"; unused_ids+=("$id")
  done < <(docker image ls -a --format '{{.ID}} {{.Repository}} {{.Tag}}' | sort -u)
  if [ "$APLICAR" = 1 ]; then
    for id in "${unused_ids[@]:-}"; do [ -n "$id" ] && docker rmi "$id" >/dev/null 2>&1 || true; done
    docker builder prune -f >/dev/null 2>&1 || true
  fi
fi

# 2) Caches regeneráveis ---------------------------------------------------------------------------------------------
echo "Caches"
for d in "$HOME/.npm/_cacache" "$HOME/.cache/google-chrome" "$HOME/.cache/google-chrome-headless" "$HOME/.cache/electron" "$HOME/.gradle/caches"; do
  [ -d "$d" ] || continue
  item "${d/#$HOME/~}" "$(tamanho "$d")"
  [ "$APLICAR" = 1 ] && rm -rf "$d"
done

# 3) Do projeto -------------------------------------------------------------------------------------------------------
echo "Projeto"
if e2e_rodando; then
  echo "  (E2E rodando agora: não mexo em dist/, playwright-report/ e test-results/)"
else
  for d in "$ROOT/frontend/dist" "$ROOT/playwright-report" "$ROOT/test-results"; do
    [ -d "$d" ] || continue
    item "${d/#$ROOT\//}" "$(tamanho "$d")"
    [ "$APLICAR" = 1 ] && rm -rf "$d"
  done
fi
if [ -d "$QA_OUT" ]; then
  old="$(find "$QA_OUT" -type f ! -name '*.md' -mtime +3 -print0 2>/dev/null | du -cb --files0-from=- 2>/dev/null | tail -1 | awk '{print $1+0}')"
  item "capturas/vídeos de QA com mais de 3 dias (relatórios ficam)" "${old:-0}"
  [ "$APLICAR" = 1 ] && find "$QA_OUT" -type f ! -name '*.md' -mtime +3 -delete 2>/dev/null
fi

# 4) Downloads: só instaladores antigos --------------------------------------------------------------------------------
if [ -d "$HOME/Downloads" ]; then
  echo "Downloads (só instaladores com mais de 60 dias)"
  while IFS= read -r -d '' f; do
    item "~/Downloads/$(basename "$f")" "$(stat -c %s "$f")"
    [ "$APLICAR" = 1 ] && rm -f "$f"
  done < <(find "$HOME/Downloads" -maxdepth 2 -type f \( -iname '*.deb' -o -iname '*.AppImage' -o -iname '*.rpm' -o -iname '*.iso' -o -iname '*.exe' -o -iname '*.msi' -o -iname '*.dmg' \) -mtime +60 -print0 2>/dev/null)
fi

echo
if [ "$APLICAR" = 1 ]; then
  DEPOIS="$(livre)"; echo "✅ Liberado: $(hum $((DEPOIS - ANTES)))  ·  livre agora: $(hum "$DEPOIS")"
else
  echo "Dá para liberar cerca de $(hum "$TOTAL"). Para remover: scripts/limpar-espaco.sh --aplicar"
fi
