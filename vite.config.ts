import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import proxyOptions from './proxyOptions'

// Dev server proxies Frappe routes so the SPA and API share origin and session cookies.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: proxyOptions,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
