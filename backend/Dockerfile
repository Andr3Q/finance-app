# ═══════════════════════════════════════════════════════
# 🐳 backend/Dockerfile
#
# Receita para montar o container do backend.
# O Docker lê este arquivo de cima para baixo e executa
# cada instrução para construir a "imagem" do backend.
# ═══════════════════════════════════════════════════════

# Base: Node.js versão 20 na versão leve (alpine = Linux mínimo)
FROM node:20-alpine

# Instala OpenSSL — necessário para o Prisma funcionar no Alpine Linux
# Sem isso, o Prisma não consegue se comunicar com o banco de dados
RUN apk add --no-cache openssl openssl-dev

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia apenas os arquivos de dependências primeiro
# (otimização: o Docker faz cache desta etapa se package.json não mudar)
COPY package*.json ./

# Instala todas as dependências do projeto
RUN npm install

# Copia o schema do Prisma e gera o cliente do banco
COPY prisma ./prisma/
RUN npx prisma generate

# Copia o restante do código-fonte
COPY . .

# Expõe a porta 3001 para o Docker Compose
EXPOSE 3001

# Usuário sem privilégios — minimiza impacto de vulnerabilidades
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001 -G appuser
RUN chown -R appuser:appuser /app
USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

CMD ["sh", "-c", "npx prisma generate && node src/server.js"]
