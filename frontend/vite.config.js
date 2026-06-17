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
          if (['react/', 'react-dom/', 'react-router-dom/'].some(m => id.includes(`/node_modules/${m}`))) {
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
