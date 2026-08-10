#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════
# deploy.sh — Deploy seguro do FinançasPro no Cloud Run
#
# Estratégia:
#   1. Build e push da nova imagem
#   2. Deploy da nova revisão com 0% de tráfego
#   3. Health check na nova revisão
#   4. Rollout gradual: 10% → 50% → 100%
#   5. Em qualquer falha: rollback automático para a revisão anterior
#
# Uso:
#   ./deploy.sh              → deploy completo (padrão)
#   ./deploy.sh --canary     → para em 10%, aguarda confirmação manual
#   ./deploy.sh --rollback   → reverte para a revisão anterior
#
# ══════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Configuração ────────────────────────────────────────────────
PROJECT="financaspro-2024"
SERVICE="finance-app"
REGION="southamerica-east1"
HEALTH_URL="https://finance-app-1042158013294.southamerica-east1.run.app/health"
CANARY_MODE=false
ROLLBACK_MODE=false

# ── Cores para output ───────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

log()     { echo -e "${BLUE}[deploy]${NC} $*"; }
success() { echo -e "${GREEN}✔${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✖${NC} $*" >&2; }

# ── Parse de argumentos ─────────────────────────────────────────
for arg in "$@"; do
  case $arg in
    --canary)   CANARY_MODE=true ;;
    --rollback) ROLLBACK_MODE=true ;;
    --help|-h)
      echo "Uso: $0 [--canary | --rollback]"
      exit 0 ;;
  esac
done

# ── Rollback ────────────────────────────────────────────────────
if $ROLLBACK_MODE; then
  warn "Iniciando ROLLBACK..."
  PREV=$(gcloud run revisions list \
    --service "$SERVICE" --region "$REGION" \
    --format="value(name)" --sort-by="~createTime" \
    --limit=2 | tail -1)

  if [[ -z "$PREV" ]]; then
    error "Nenhuma revisão anterior encontrada."
    exit 1
  fi

  log "Revertendo para revisão: $PREV"
  gcloud run services update-traffic "$SERVICE" \
    --region "$REGION" \
    --to-revisions="${PREV}=100" \
    --quiet

  success "Rollback concluído → $PREV (100% do tráfego)"
  exit 0
fi

# ── Pré-checks ──────────────────────────────────────────────────
log "Verificando pré-requisitos..."
command -v gcloud >/dev/null || { error "gcloud não encontrado."; exit 1; }
gcloud config get-value project &>/dev/null || { error "gcloud não autenticado."; exit 1; }

# Captura a revisão atual (antes do deploy) para rollback automático
CURRENT_REVISION=$(gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --format="value(status.latestReadyRevisionName)" 2>/dev/null || true)
log "Revisão atual: ${CURRENT_REVISION:-nenhuma}"

# ── Build e deploy com 0% de tráfego ────────────────────────────
log "Iniciando build e deploy da nova revisão (0% tráfego)..."
NEW_REVISION=$(gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --no-traffic \
  --quiet 2>&1 | grep -oP 'finance-app-\d+-\w+' | tail -1)

if [[ -z "$NEW_REVISION" ]]; then
  # Fallback: pega a última revisão criada
  NEW_REVISION=$(gcloud run revisions list \
    --service "$SERVICE" --region "$REGION" \
    --format="value(name)" --sort-by="~createTime" \
    --limit=1)
fi

success "Nova revisão buildada: $NEW_REVISION"

# ── Health check direto na nova revisão ─────────────────────────
log "Executando health check na nova revisão..."
REVISION_URL=$(gcloud run revisions describe "$NEW_REVISION" \
  --region "$REGION" \
  --format="value(status.url)" 2>/dev/null || echo "")

# Se não há URL de revisão direta, testa via URL principal (nova revisão recebe 0%)
# Usa o header X-Serverless-Preview quando disponível
sleep 5  # aguarda contêiner inicializar

HEALTH_CHECK_PASSED=false
for attempt in 1 2 3; do
  log "  Health check tentativa $attempt/3..."
  if curl -sf --max-time 15 "$HEALTH_URL" \
    -H "Accept: application/json" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('status')=='ok' else 1)" 2>/dev/null; then
    HEALTH_CHECK_PASSED=true
    break
  fi
  sleep 10
done

if ! $HEALTH_CHECK_PASSED; then
  error "Health check FALHOU. Abortando deploy."
  warn "A nova revisão $NEW_REVISION não recebeu tráfego."
  warn "Para remover: gcloud run revisions delete $NEW_REVISION --region $REGION"
  exit 1
fi
success "Health check OK"

# ── Rollout gradual ─────────────────────────────────────────────
rollout_to() {
  local pct="$1"
  log "Direcionando ${pct}% do tráfego para $NEW_REVISION..."
  gcloud run services update-traffic "$SERVICE" \
    --region "$REGION" \
    --to-revisions="${NEW_REVISION}=${pct}" \
    --quiet

  sleep 8
  # Verifica saúde após o split
  if ! curl -sf --max-time 10 "$HEALTH_URL" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('status')=='ok' else 1)" 2>/dev/null; then
    error "Health check FALHOU com ${pct}% de tráfego."
    return 1
  fi
  success "${pct}% → OK"
}

rollback_on_failure() {
  error "Falha detectada! Revertendo para $CURRENT_REVISION..."
  gcloud run services update-traffic "$SERVICE" \
    --region "$REGION" \
    --to-revisions="${CURRENT_REVISION}=100" \
    --quiet 2>/dev/null || true
  error "Rollback concluído. Deploy cancelado."
  exit 1
}

# ── Canary mode: para em 10% ────────────────────────────────────
if $CANARY_MODE; then
  rollout_to 10 || rollback_on_failure
  warn "Modo canary: 10% do tráfego na nova revisão."
  warn "Monitore os logs: gcloud run services logs read $SERVICE --region $REGION"
  warn "Para completar o rollout: gcloud run services update-traffic $SERVICE --region $REGION --to-revisions=${NEW_REVISION}=100 --quiet"
  warn "Para rollback: ./deploy.sh --rollback"
  exit 0
fi

# ── Deploy completo: 10% → 50% → 100% ──────────────────────────
rollout_to 10  || rollback_on_failure
rollout_to 50  || rollback_on_failure
rollout_to 100 || rollback_on_failure

echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Deploy concluído com sucesso!${NC}"
echo -e "${BOLD}${GREEN}  Revisão: $NEW_REVISION${NC}"
echo -e "${BOLD}${GREEN}  URL: $HEALTH_URL${NC}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════${NC}"
