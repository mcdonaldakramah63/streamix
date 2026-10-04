import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND = process.env.STREAMIX_BACKEND || 'http://localhost:5000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: false },
      '/ws':  { target: BACKEND.replace(/^http/, 'ws'), ws: true },
      '/uploads': { target: BACKEND, changeOrigin: false },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: false },
      '/ws':  { target: BACKEND.replace(/^http/, 'ws'), ws: true },
      '/uploads': { target: BACKEND, changeOrigin: false },
    },
  },
})
