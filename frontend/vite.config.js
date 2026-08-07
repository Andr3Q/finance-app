import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
    globals: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: `http://${process.env.BACKEND_HOST || 'localhost'}:3001`,
        changeOrigin: true
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // react-router-dom v7 é um wrapper fino sobre react-router — o grosso do
          // código de rotas agora mora em node_modules/react-router/, não mais em
          // react-router-dom/. Sem essa entrada, o chunk vendor-react ficaria vazio
          // de código de rotas e ele cairia no bundle principal.
          if (['react/', 'react-dom/', 'react-router/', 'react-router-dom/'].some(m => id.includes(`/node_modules/${m}`))) {
            return 'vendor-react'
          }
          if (id.includes('/node_modules/axios/')) {
            return 'vendor-http'
          }
        }
      }
    }
  }
})
