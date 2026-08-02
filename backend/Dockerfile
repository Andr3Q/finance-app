# ═══════════════════════════════════════════════════════
# 🐳 backend/Dockerfile
#
# Receita para montar o container do backend.
# O Docker lê este arquivo de cima para baixo e executa
# cada instrução para construir a "imagem" do backend.
# ═══════════════════════════════════════════════════════

# Base: Node.js versão 20 Debian slim (compatível com Prisma 5.22+ WASM)
FROM node:26-slim

# Instala OpenSSL e ca-certificates necessários para o Prisma e conexões SSL
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia apenas os arquivos de dependências primeiro
# (otimização: o Docker faz cache desta etapa se package.json não mudar)
COPY package*.json ./

# Instala apenas dependências de produção (sem Jest, ESLint, devDeps)
RUN npm ci --omit=dev

# Copia o schema do Prisma e gera o cliente do banco
COPY prisma ./prisma/
RUN npx prisma generate

# Copia o restante do código-fonte
COPY . .

# Expõe a porta 3001 para o Docker Compose
EXPOSE 3001

# Usuário sem privilégios — minimiza impacto de vulnerabilidades
RUN groupadd -g 1001 appuser && useradd -u 1001 -g appuser -s /bin/sh appuser
RUN chown -R appuser:appuser /app
USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]
