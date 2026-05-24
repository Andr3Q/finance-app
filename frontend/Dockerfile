# ═══════════════════════════════════════════════════════
# 🐳 frontend/Dockerfile
# ═══════════════════════════════════════════════════════

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

RUN addgroup -g 1001 appuser && adduser -u 1001 -G appuser -s /bin/sh -D appuser
RUN chown -R appuser:appuser /app
USER appuser

CMD ["npm", "run", "dev"]
