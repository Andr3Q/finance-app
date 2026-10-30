#!/usr/bin/env bash
# Prova que um backup RESTAURA: sobe um Postgres descartável (Docker), restaura o arquivo nele e mostra quantas linhas tem cada
# tabela. Nada toca na produção — tudo roda no SEU computador e o contêiner (com os dados) é removido no fim. Um backup que nunca
# foi restaurado não é um backup de verdade: rode isto uma vez em cada backup importante (ex.: antes de uma subida).
#
# Uso:  scripts/restore-test.sh ~/backups-nancy/nancy-prod-AAAA-MM-DD-HHMM.dump
#       (PG_IMAGE=postgres:18 scripts/restore-test.sh ...  se o backup foi feito com outra versão)
set -euo pipefail

FILE="${1:?informe o arquivo .dump (ex.: ~/backups-nancy/nancy-prod-2026-10-30-0900.dump)}"
[ -f "$FILE" ] || { echo "❌ Arquivo não encontrado: $FILE"; exit 1; }
command -v docker >/dev/null || { echo "❌ Docker não encontrado."; exit 1; }

PG_IMAGE="${PG_IMAGE:-postgres:17}"
NOME="nancy-restore-test"
cleanup() { docker rm -f "$NOME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "⏳ Subindo um Postgres descartável (${PG_IMAGE})..."
docker run -d --name "$NOME" -e POSTGRES_PASSWORD=teste "$PG_IMAGE" >/dev/null
for _ in $(seq 1 60); do docker exec "$NOME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$NOME" pg_isready -U postgres >/dev/null || { echo "❌ O Postgres de teste não subiu."; exit 1; }

echo "⏳ Restaurando $(basename "$FILE")..."
# Erros "role ... does not exist"/extensões do Supabase não impedem a restauração dos dados: são mostrados, e o que vale é a contagem abaixo.
docker exec -i "$NOME" pg_restore -U postgres -d postgres --no-owner --no-privileges < "$FILE" 2> >(grep -v '^$' | head -20 >&2) || \
  echo "   (o pg_restore avisou sobre itens ignorados — normal quando o dump vem do Supabase; confira a contagem abaixo)"

echo "🔎 Linhas por tabela (exato):"
docker exec "$NOME" psql -U postgres -X -c "
  SELECT table_name AS tabela,
         (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text::int AS linhas
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY 2 DESC, 1;"

TABELAS=$(docker exec "$NOME" psql -U postgres -X -At -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
COM_DADOS=$(docker exec "$NOME" psql -U postgres -X -At -c "
  SELECT count(*) FROM (
    SELECT (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text::int AS n
    FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') t WHERE n > 0")
if [ "$TABELAS" -lt 5 ] || [ "$COM_DADOS" -lt 3 ]; then
  echo "⚠️  Poucas tabelas ($TABELAS) ou poucas com dados ($COM_DADOS) — este backup parece incompleto."; exit 1
fi
echo "✅ O backup restaura: ${TABELAS} tabelas, ${COM_DADOS} com dados. O Postgres de teste será removido agora."
