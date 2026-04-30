# ═══════════════════════════════════════════════════════
# 🐳 frontend/Dockerfile
# ═══════════════════════════════════════════════════════

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# "npm run dev" já inclui --host (configurado no package.json)
CMD ["npm", "run", "dev"]
