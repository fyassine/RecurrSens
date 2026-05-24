import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
    // Safari requires explicit HMR config and no-cache headers to avoid
    // stale module loading that silently breaks the page
    hmr: {
      protocol: 'ws',
      host: 'localhost',
    },
    headers: {
      'Cache-Control': 'no-store',
    },
  },
})
