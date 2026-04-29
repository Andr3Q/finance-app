# ═══════════════════════════════════════════════════════
# 🐳 frontend/Dockerfile
# ═══════════════════════════════════════════════════════

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# "--host" é necessário para o Vite aceitar conexões de fora do container
CMD ["npm", "run", "dev", "--", "--host"]
