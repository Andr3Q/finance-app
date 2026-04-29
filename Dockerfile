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
RUN npm install

# Copia o código e compila para produção
COPY frontend/ ./
RUN npm run build
# Resultado: pasta /frontend/dist com HTML/CSS/JS otimizados


# ── Stage 2: Backend de Produção ────────────────────────
FROM node:20-alpine

# OpenSSL necessário para o Prisma
RUN apk add --no-cache openssl openssl-dev

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

# Variáveis de ambiente de produção
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Inicialização:
# 1. Sincroniza o schema com o banco (cria tabelas se não existirem)
# 2. Inicia o servidor Express
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node src/server.js"]
