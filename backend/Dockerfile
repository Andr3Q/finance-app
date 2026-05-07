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

# Comando de inicialização:
# 1. Roda as migrations do banco (cria as tabelas se não existirem)
# 2. Inicia o servidor com nodemon (reinicia automaticamente ao salvar)
# prisma db push → cria as tabelas direto do schema.prisma (não precisa de migrations)
# nodemon → reinicia o servidor automaticamente quando você editar algum arquivo
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node src/server.js"]
