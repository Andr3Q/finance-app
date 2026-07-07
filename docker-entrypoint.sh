#!/bin/sh
set -e

echo "[entrypoint] NODE_ENV=$NODE_ENV  PORT=$PORT"

if [ "$NODE_ENV" = "production" ]; then
  echo "[entrypoint] Rodando migrations..."
  i=1
  until timeout 60 npx prisma migrate deploy; do
    if [ $i -ge 4 ]; then
      echo "[WARN] migrate deploy falhou após 4 tentativas, iniciando servidor mesmo assim"
      break
    fi
    echo "[migrate] tentativa $i falhou, aguardando $((i * 2))s..."
    i=$((i + 1))
    sleep $((i * 2))
  done
  echo "[entrypoint] Migrations concluídas."
fi

echo "[entrypoint] Iniciando servidor Node.js..."
exec node src/server.js
