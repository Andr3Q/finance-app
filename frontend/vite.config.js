// ═══════════════════════════════════════════════════════
// ⚡ vite.config.js — Configuração do Vite
//
// Vite é o "servidor de desenvolvimento" do frontend.
// Ele compila o React, serve os arquivos e faz hot reload
// (atualiza o navegador automaticamente ao salvar código).
// ═══════════════════════════════════════════════════════

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',  // Aceita conexões de fora do container Docker
    port: 5173,
    // Proxy: redireciona chamadas /api/* para o backend
    // Assim o frontend chama "/api/..." e o Vite envia para "http://backend:3001/..."
    proxy: {
      '/api': {
        target: 'http://backend:3001',
        changeOrigin: true
        // sem rewrite: /api/auth → backend recebe /api/auth (igual à produção)
      }
    }
  }
})
