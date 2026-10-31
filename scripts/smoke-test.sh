#!/usr/bin/env bash
# Smoke test pós-deploy do Nancy — SOMENTE LEITURA (GET/HEAD, nada é criado nem alterado).
#
# Uso:
#   scripts/smoke-test.sh https://finance-app-staging-vzcnezphtq-rj.a.run.app
#   scripts/smoke-test.sh https://finance-app-1042158013294.southamerica-east1.run.app production
#
# O 2º argumento "production" deixa o teste mais rígido: o /api/monitor precisa responder 401 (com MONITOR_SECRET
# configurado). Em homologação o segredo não existe e ele responde 503, o que vira só um alerta.
#
# Sai com 0 se tudo passou e 1 se algo falhou (alertas ⚠️ não reprovam). Confere o que quebra "em silêncio" depois de
# um deploy: o app abre, o JS que o index.html aponta existe (chunk velho = tela branca), cabeçalhos de segurança, PWA
# (manifest, ícones, service worker), rotas privadas respondendo 401 sem sessão e o banco respondendo no /health.
set -u

BASE="${1:-}"
MODE="${2:-staging}"
if [ -z "$BASE" ]; then echo "uso: $0 <URL base, sem barra no fim> [production]"; exit 2; fi
BASE="${BASE%/}"

FAIL=0; WARN=0
ok()   { echo "  ✅ $1"; }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  ⚠️  $1"; WARN=$((WARN + 1)); }

status() { curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$1"; }
header() { curl -sI --max-time 20 "$1" | tr -d '\r' | grep -i "^$2:" | head -1 | cut -d: -f2- | sed 's/^ *//'; }

expect_status() { # nome url esperado
  local s; s=$(status "$2")
  if [ "$s" = "$3" ]; then ok "$1 → HTTP $s"; else bad "$1 → esperado $3, recebeu $s"; fi
}

echo "🔥 Smoke test: $BASE"
echo
echo "1) Saúde"
HEALTH=$(curl -s --max-time 20 "$BASE/health")
if echo "$HEALTH" | grep -q '"status":"ok"'; then ok "/health ok"; else bad "/health não está ok: ${HEALTH:0:120}"; fi
DB_MS=$(echo "$HEALTH" | sed -n 's/.*"db_ms":\([0-9]*\).*/\1/p')
if [ -n "$DB_MS" ]; then
  if [ "$DB_MS" -gt 3000 ]; then bad "banco lento: db_ms=$DB_MS (limite 3000)"
  elif [ "$DB_MS" -gt 1000 ]; then warn "banco acima de 1s: db_ms=$DB_MS (produção costuma ficar abaixo de 600)"
  else ok "banco respondendo: db_ms=$DB_MS"; fi
fi
expect_status "/ping" "$BASE/ping" 200

echo
echo "2) App (SPA) e arquivos que o index.html aponta"
INDEX=$(curl -s --max-time 20 "$BASE/")
if echo "$INDEX" | grep -q 'id="root"'; then ok "index.html traz o #root"; else bad "index.html sem #root"; fi
ASSETS=$(echo "$INDEX" | grep -oE '(src|href)="/assets/[^"]+"' | sed -E 's/^(src|href)="//; s/"$//' | sort -u)
if [ -z "$ASSETS" ]; then bad "index.html não referencia nada em /assets/"; fi
for a in $ASSETS; do
  s=$(status "$BASE$a"); t=$(header "$BASE$a" content-type)
  case "$a" in
    *.js)  if [ "$s" = "200" ] && echo "$t" | grep -qi javascript; then ok "$a ($s, $t)"; else bad "$a → $s, $t (JS esperado; HTML aqui = tela branca)"; fi ;;
    *.css) if [ "$s" = "200" ] && echo "$t" | grep -qi css; then ok "$a ($s)"; else bad "$a → $s, $t"; fi ;;
    *)     if [ "$s" = "200" ]; then ok "$a ($s)"; else bad "$a → $s"; fi ;;
  esac
done
for r in /login /register /forgot-password /planos /termos /privacidade /dashboard /transactions /goals /settings /financas /rota-que-nao-existe; do
  expect_status "SPA $r" "$BASE$r" 200
done

echo
echo "3) PWA"
MANIFEST=$(curl -s --max-time 20 "$BASE/manifest.json")
if echo "$MANIFEST" | python3 -c 'import json,sys; m=json.load(sys.stdin); assert m["name"] and m["icons"]' 2>/dev/null; then ok "manifest.json válido"; else bad "manifest.json inválido"; fi
for p in /icon-192.png /icon-512.png /logo-icon.png; do
  s=$(status "$BASE$p"); t=$(header "$BASE$p" content-type)
  if [ "$s" = "200" ] && echo "$t" | grep -qi image; then ok "$p ($s)"; else bad "$p → $s, $t"; fi
done
SWT=$(header "$BASE/sw.js" content-type); SWC=$(header "$BASE/sw.js" cache-control)
if [ "$(status "$BASE/sw.js")" = "200" ] && echo "$SWT" | grep -qi javascript; then ok "/sw.js servido como JS"; else bad "/sw.js não é JS ($SWT)"; fi
if echo "$SWC" | grep -qiE 'no-cache|max-age=0|no-store'; then ok "/sw.js sem cache longo ($SWC)"; else warn "/sw.js com cache: '$SWC' (o service worker novo pode demorar a chegar)"; fi

echo
echo "4) Segurança (cabeçalhos)"
for h in strict-transport-security x-content-type-options content-security-policy referrer-policy x-frame-options; do
  v=$(header "$BASE/" "$h"); if [ -n "$v" ]; then ok "$h presente"; else bad "$h ausente"; fi
done
PP=$(header "$BASE/" permissions-policy)
if echo "$PP" | grep -q 'microphone=(self)'; then ok "permissions-policy libera o microfone (chat por voz): $PP"; else warn "permissions-policy sem microphone=(self): '$PP' (chat por voz falha)"; fi

echo
echo "5) API protegida (sem sessão tem que dar 401)"
for p in /api/auth/me /api/budget /api/transactions /api/transactions/dashboard /api/goals /api/installments /api/agent/weekly-tip; do
  expect_status "$p sem sessão" "$BASE$p" 401
done
s=$(status "$BASE/api/monitor/dashboard")
if [ "$s" = "401" ]; then ok "/api/monitor protegido → 401"
elif [ "$s" = "503" ] && [ "$MODE" != "production" ]; then warn "/api/monitor → 503 (MONITOR_SECRET não configurado neste ambiente)"
else bad "/api/monitor/dashboard → esperado 401, recebeu $s"; fi
s=$(status "$BASE/api/rota-que-nao-existe"); if [ "$s" = "404" ] || [ "$s" = "401" ]; then ok "rota inexistente da API → $s"; else warn "rota inexistente da API → $s"; fi

echo
echo "─────────────────────────────"
if [ "$FAIL" -eq 0 ]; then echo "✅ Smoke test passou ($WARN alerta(s))"; exit 0; fi
echo "❌ Smoke test falhou: $FAIL erro(s), $WARN alerta(s)"; exit 1
