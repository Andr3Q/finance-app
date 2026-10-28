#!/usr/bin/env bash
# Backup MANUAL do banco de produção (Supabase) — roda no SEU computador, usa Docker (não precisa instalar o Postgres) e
# grava o arquivo FORA do repositório. O arquivo tem dados pessoais e financeiros dos usuários: nunca commitar, nunca
# mandar para pasta pública; guarde em disco/pasta com acesso restrito (ou criptografado).
#
# Uso:
#   export PROD_DB_URL='postgresql://postgres:SENHA@db.XXXX.supabase.co:5432/postgres'
#   scripts/backup-prod.sh [pasta de destino]        # padrão: ~/backups-nancy
#
# Onde pegar a URL: Supabase → Project Settings → Database → Connection string → URI (troque [YOUR-PASSWORD] pela senha).
#  • Se der erro de conexão ("Network is unreachable"): o endereço direto do Supabase pode ser só IPv6 e o Docker usa IPv4.
#    Use a conexão "Session pooler" (host *.pooler.supabase.com, porta 5432, usuário postgres.<ref-do-projeto>) — também em "Connection string".
#  • NÃO use a porta 6543 (transaction pooler): não serve para backup.
#  • Versão do Postgres: use uma imagem >= a do Supabase (Project Settings → Infrastructure). Padrão postgres:17; troque com PG_IMAGE=postgres:18.
set -euo pipefail

: "${PROD_DB_URL:?defina PROD_DB_URL com a connection string da produção (veja o cabeçalho deste arquivo)}"
command -v docker >/dev/null || { echo "❌ Docker não encontrado."; exit 1; }

DEST="${1:-$HOME/backups-nancy}"
PG_IMAGE="${PG_IMAGE:-postgres:17}"
STAMP="$(date +%Y-%m-%d-%H%M)"
FILE="nancy-prod-${STAMP}.dump"

mkdir -p "$DEST"; chmod 700 "$DEST"
case "$(cd "$DEST" && pwd)" in
  "$(cd "$(dirname "$0")/.." && pwd)"*) echo "❌ A pasta de destino está dentro do repositório (que é público). Escolha outra."; exit 1 ;;
esac

echo "⏳ Gerando backup (${PG_IMAGE}) → ${DEST}/${FILE}"
docker run --rm -v "$DEST":/backup -e PROD_DB_URL "$PG_IMAGE" \
  sh -c 'pg_dump "$PROD_DB_URL" --format=custom --no-owner --no-privileges --schema=public --file="/backup/'"$FILE"'"'
chmod 600 "$DEST/$FILE"

echo "🔎 Conferindo o arquivo..."
TABLES=$(docker run --rm -v "$DEST":/backup "$PG_IMAGE" pg_restore --list "/backup/$FILE" | grep -c "TABLE DATA" || true)
SIZE=$(du -h "$DEST/$FILE" | cut -f1)
SUM=$(sha256sum "$DEST/$FILE" | cut -d' ' -f1)
echo "   tabelas com dados: $TABLES · tamanho: $SIZE"
echo "   sha256: $SUM"
if [ "$TABLES" -lt 5 ]; then echo "⚠️  Poucas tabelas no backup — confira se a URL aponta para o banco certo."; exit 1; fi
echo "✅ Backup pronto: $DEST/$FILE"
echo "   Guarde uma cópia fora deste computador (disco externo/pasta privada). Não commitar."
