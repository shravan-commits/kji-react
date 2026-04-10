import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import proxyOptions from './proxyOptions'

// Doppio-style dev server: proxy Frappe routes so frappe-react-sdk can use same-origin cookies.
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
