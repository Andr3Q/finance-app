#!/usr/bin/env bash
# Backup MANUAL do banco de produção (Supabase) — roda no SEU computador, usa Docker (não precisa instalar o Postgres) e
# grava o arquivo FORA do repositório. O arquivo tem dados pessoais e financeiros dos usuários: nunca commitar, nunca
# mandar para pasta pública; guarde em disco/pasta com acesso restrito (ou criptografado).
#
# Uso (UM comando só):
#   scripts/backup-prod.sh [pasta de destino]        # padrão: ~/backups-nancy
# O script PEDE o que precisa (a digitação fica escondida e nada vai para o histórico do terminal):
#   1) a URL do banco — a do Supabase (Connect → URI → Session pooler), que traz "[YOUR-PASSWORD]" no lugar da senha;
#   2) a senha do banco (só se a URL ainda tiver o "[YOUR-PASSWORD]") — ele a codifica sozinho, então @ # / : ? % & na senha não quebram.
# Quem preferir pode definir PROD_DB_URL no ambiente (URL completa, já com a senha codificada): aí ele não pergunta nada.
# O que for colado é conferido: precisa ser postgresql://, sem "?parâmetros" no fim (são tirados) e nunca a porta 6543.
#
# Onde pegar a URL: Supabase → botão "Connect" (ou Project Settings → Database → Connection string) → URI.
#  • A conexão DIRETA (db.<ref>.supabase.co:5432) funciona: o contêiner usa a rede do seu computador (--network host) e o Supabase só
#    atende esse endereço por IPv6 (o Docker sozinho não tem IPv6). Se o seu computador NÃO tiver IPv6 ("Network is unreachable"),
#    use o "Session pooler" (host *.pooler.supabase.com, porta 5432, usuário postgres.<ref-do-projeto>), que é IPv4.
#  • NÃO use a porta 6543 (transaction pooler): não serve para backup.
#  • A senha é a do BANCO (não a do login do Supabase). Se não lembrar, NÃO redefina (derrubaria a produção): ela está no segredo
#    DATABASE_URL do Google Cloud (Secret Manager), entre "postgres:" e "@".
#  • Versão do Postgres: use uma imagem >= a do Supabase (Project Settings → Infrastructure). Padrão postgres:17; troque com PG_IMAGE=postgres:18.
set -euo pipefail
command -v docker >/dev/null || { echo "❌ Docker não encontrado."; exit 1; }

# Codifica byte a byte (só A-Z a-z 0-9 . _ ~ - ficam como estão): senha com @ # / : ? % & espaço... vira %XX e não quebra a URL.
urlencode() {
  local LC_ALL=C s="$1" out="" c i
  for (( i = 0; i < ${#s}; i++ )); do
    c="${s:i:1}"
    case "$c" in
      [a-zA-Z0-9._~-]) out+="$c" ;;
      *) out+="$(printf '%%%02X' $(( $(printf '%d' "'$c") & 255 )))" ;;
    esac
  done
  printf '%s' "$out"
}

# ── A URL do banco ───────────────────────────────────────────────────────────────────────────────────────────────────────
if [ -z "${PROD_DB_URL:-}" ]; then
  [ -t 0 ] || { echo "❌ Defina PROD_DB_URL ou rode num terminal, para o script poder pedir a URL."; exit 1; }
  read -rsp "Cole a URL do banco de PRODUÇÃO (Supabase → Connect → Session pooler) e aperte Enter: " PROD_DB_URL; echo
fi
PROD_DB_URL="${PROD_DB_URL//[[:space:]]/}"   # espaço/quebra de linha que veio junto da colagem
PROD_DB_URL="${PROD_DB_URL%%\?*}"            # "?schema=public", "?pgbouncer=true"...: o pg_dump não aceita
case "$PROD_DB_URL" in
  postgresql://*|postgres://*) ;;
  "") echo "❌ Nada foi colado. Rode de novo e cole a URL (ela começa com postgresql://). Nada foi feito."; exit 1 ;;
  *)  echo "❌ O que foi colado não parece uma URL de banco (ela começa com postgresql://). Nada foi feito."; exit 1 ;;
esac
case "$PROD_DB_URL" in
  *:6543|*:6543/*) echo "❌ A porta 6543 é o transaction pooler e não serve para backup. Use o Session pooler (porta 5432). Nada foi feito."; exit 1 ;;
esac
# URL do Supabase ainda com o marcador no lugar da senha (":[YOUR-PASSWORD]@"): pergunta a senha e a coloca já codificada.
if [[ "$PROD_DB_URL" =~ (:\[[^]]*\]@) ]]; then
  MARCADOR="${BASH_REMATCH[1]}"
  [ -t 0 ] || { echo "❌ A URL ainda tem o marcador da senha e não há terminal para pedi-la. Nada foi feito."; exit 1; }
  read -rsp "Digite a senha do BANCO (não aparece na tela) e aperte Enter: " DB_PASS; echo
  [ -n "$DB_PASS" ] || { echo "❌ Senha vazia. Nada foi feito."; exit 1; }
  PROD_DB_URL="${PROD_DB_URL/"$MARCADOR"/:$(urlencode "$DB_PASS")@}"
  unset DB_PASS MARCADOR
fi
# Mostra onde vai conectar (a senha mascarada) para você conferir host, porta e usuário.
echo "   Conectando em: $(printf '%s' "$PROD_DB_URL" | sed -E 's#(://[^:/@]+):[^@]*@#\1:****@#')"
export PROD_DB_URL

DEST="${1:-$HOME/backups-nancy}"
PG_IMAGE="${PG_IMAGE:-postgres:17}"
STAMP="$(date +%Y-%m-%d-%H%M)"
FILE="nancy-prod-${STAMP}.dump"

mkdir -p "$DEST"; chmod 700 "$DEST"
case "$(cd "$DEST" && pwd)" in
  "$(cd "$(dirname "$0")/.." && pwd)"*) echo "❌ A pasta de destino está dentro do repositório (que é público). Escolha outra."; exit 1 ;;
esac

# -u: o contêiner roda como VOCÊ (sem isso o arquivo nascia como root, o chmod abaixo falhava e o dump ficava legível por todos);
# umask 077: o arquivo já nasce só seu, mesmo que algo falhe depois.
ME="$(id -u):$(id -g)"
echo "⏳ Gerando backup (${PG_IMAGE}) → ${DEST}/${FILE}"
# --network host: o Docker em rede própria não tem IPv6 e o endereço direto do Supabase só tem IPv6.
if ! docker run --rm --network host -u "$ME" -v "$DEST":/backup -e PROD_DB_URL "$PG_IMAGE" \
  sh -c 'umask 077 && pg_dump "$PROD_DB_URL" --format=custom --no-owner --no-privileges --schema=public --file="/backup/'"$FILE"'"'; then
  rm -f "$DEST/$FILE"   # um arquivo vazio ou pela metade não é backup e só confunde
  echo "❌ O backup falhou e nenhum arquivo foi mantido. Leia a mensagem do pg_dump acima. Causas comuns:"
  echo "   • \"Network is unreachable\": seu computador/rede não tem IPv6 — use a URL do Session pooler (*.pooler.supabase.com, porta 5432, usuário postgres.<ref>)."
  echo "   • \"Connection refused\": o endereço DIRETO (db.<ref>.supabase.co) não aceitou a conexão daqui — use o Session pooler (IPv4), como acima."
  echo "   • \"Tenant or user not found\": use o endereço do pooler EXATO que o Supabase mostra em Connect (o prefixo pode ser aws-0 ou aws-1)."
  echo "   • \"password authentication failed\": a senha do BANCO está errada (não é a do login do Supabase)."
  echo "   • \"server version mismatch\": rode com PG_IMAGE=postgres:18 scripts/backup-prod.sh"
  exit 1
fi
chmod 600 "$DEST/$FILE"

echo "🔎 Conferindo o arquivo..."
TABLES=$(docker run --rm -u "$ME" -v "$DEST":/backup "$PG_IMAGE" pg_restore --list "/backup/$FILE" | grep -c "TABLE DATA" || true)
SIZE=$(du -h "$DEST/$FILE" | cut -f1)
SUM=$(sha256sum "$DEST/$FILE" | cut -d' ' -f1)
echo "   tabelas com dados: $TABLES · tamanho: $SIZE"
echo "   sha256: $SUM"
if [ "$TABLES" -lt 5 ]; then echo "⚠️  Poucas tabelas no backup — confira se a URL aponta para o banco certo."; exit 1; fi
echo "✅ Backup pronto: $DEST/$FILE"
echo "   Guarde uma cópia fora deste computador (disco externo/pasta privada). Não commitar."
