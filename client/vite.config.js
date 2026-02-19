// vite.config.js
// Configuration for Vite, our development server and build tool.
// Sets up React and configures the dev server to proxy API calls to Vercel functions.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Proxy /api requests to Vercel dev server during development
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
