import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/auth':     { target: 'http://localhost:8081', changeOrigin: true },
      '/nodes':    { target: 'http://localhost:8081', changeOrigin: true },
      '/radios':   { target: 'http://localhost:8081', changeOrigin: true },
      '/actions':  { target: 'http://localhost:8081', changeOrigin: true },
      '/audit':    { target: 'http://localhost:8081', changeOrigin: true },
      '/users':    { target: 'http://localhost:8081', changeOrigin: true },
      '/podcasts': { target: 'http://localhost:8081', changeOrigin: true },
      // Specific sub-paths only — avoids intercepting the /live SPA route on hard refresh
      '/live/active': { target: 'http://localhost:8081', changeOrigin: true },
      '/live/start':  { target: 'http://localhost:8081', changeOrigin: true },
      '/live/stop':   { target: 'http://localhost:8081', changeOrigin: true },
      '/health':   { target: 'http://localhost:8081', changeOrigin: true },
      '/media':    { target: 'http://localhost:8081', changeOrigin: true },
      '/metrics':  { target: 'http://localhost:8081', changeOrigin: true },
      '/ws': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
