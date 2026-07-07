# ═══════════════════════════════════════════════════════
# 🐳 Dockerfile — FinançasPro (Produção)
#
# Multi-stage build:
#  Stage 1 (frontend-builder): Compila o React em arquivos estáticos
#  Stage 2 (production):       Roda o backend e serve o frontend
# ═══════════════════════════════════════════════════════

# ── Stage 1: Build do Frontend ──────────────────────────
FROM node:22-alpine AS frontend-builder

WORKDIR /frontend

# Instala dependências primeiro (melhor uso do cache Docker)
COPY frontend/package*.json ./
RUN npm ci

# Incrementar CACHE_BUST para forçar rebuild completo (ex: ao deletar/mover arquivos estáticos)
ARG CACHE_BUST=2

# Copia o código e compila para produção
COPY frontend/ ./
# Injeta timestamp de build no sw.js para forçar atualização do cache a cada deploy
RUN sed -i "s/__BUILD_TS__/$(date +%s)/g" public/sw.js
RUN npm run build
# Resultado: pasta /frontend/dist com HTML/CSS/JS otimizados


# ── Stage 2: Backend de Produção ────────────────────────
FROM node:22-slim

# OpenSSL e ca-certificates necessários para o Prisma e SSL
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependências do backend (só as de produção)
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copia o código do backend
COPY backend/ ./

# Gera o Prisma Client
RUN npx prisma generate

# Copia o frontend compilado para a pasta /public do backend
# O Express vai servir esses arquivos estáticos
COPY --from=frontend-builder /frontend/dist ./public

# Variáveis de ambiente de produção
ENV NODE_ENV=production
ENV PORT=8080

# Entrypoint com lógica de migrations
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

# Usuário sem privilégios
RUN groupadd -g 1001 appuser && useradd -u 1001 -g appuser -s /bin/sh appuser
RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', r => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

CMD ["/bin/sh", "/app/docker-entrypoint.sh"]
