# ═══════════════════════════════════════════════════════
# 🐳 Dockerfile — FinançasPro (Produção)
#
# Multi-stage build:
#  Stage 1 (frontend-builder): Compila o React em arquivos estáticos
#  Stage 2 (production):       Roda o backend e serve o frontend
# ═══════════════════════════════════════════════════════

# ── Stage 1: Build do Frontend ──────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

# Instala dependências primeiro (melhor uso do cache Docker)
COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps

# Copia o código e compila para produção
COPY frontend/ ./
# Injeta timestamp de build no sw.js para forçar atualização do cache a cada deploy
RUN sed -i "s/__BUILD_TS__/$(date +%s)/g" public/sw.js
RUN npm run build
# Resultado: pasta /frontend/dist com HTML/CSS/JS otimizados


# ── Stage 2: Backend de Produção ────────────────────────
FROM node:20-slim

# OpenSSL, curl e ca-certificates necessários para o Prisma, SSL e trivy
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependências do backend (só as de produção)
COPY backend/package*.json ./
RUN npm install --omit=dev

# Copia o código do backend
COPY backend/ ./

# Gera o Prisma Client
RUN npx prisma generate

# Copia o frontend compilado para a pasta /public do backend
# O Express vai servir esses arquivos estáticos
COPY --from=frontend-builder /frontend/dist ./public

# Instala trivy (scanner de segurança) e cria pasta de cache
RUN curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh \
    | sh -s -- -b /usr/local/bin \
    && mkdir -p /app/.trivy-cache

# Variáveis de ambiente de produção
ENV NODE_ENV=production
ENV PORT=8080

# Usuário sem privilégios
RUN groupadd -g 1001 appuser && useradd -u 1001 -g appuser -s /bin/sh appuser
RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', r => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Inicialização:
# prisma migrate deploy com retry — Supabase free pausa após inatividade e pode
# retornar P1001 no primeiro acesso. Retry com backoff: waits de 4s, 6s, 8s.
# Após 4 tentativas sem sucesso, servidor sobe mesmo assim (migrations já aplicadas
# pelo CI ou em deploy anterior). Advisory lock do PostgreSQL garante que instâncias
# concorrentes não corrompem o banco — apenas serializam a execução.
CMD ["sh", "-c", "i=1; until timeout 60 npx prisma migrate deploy; do if [ $i -ge 4 ]; then echo '[WARN] migrate deploy falhou após 4 tentativas, iniciando servidor mesmo assim'; break; fi; echo \"[migrate] tentativa $i falhou, aguardando $((i*2))s...\"; i=$((i+1)); sleep $((i*2)); done && node src/server.js"]
