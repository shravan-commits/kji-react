import fs from 'node:fs'
import path from 'path'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import proxyOptions from './proxyOptions'

/** Dev HTTPS is on by default so Web Crypto (Keycloak PKCE) works on non-localhost URLs. Set VITE_DEV_HTTPS=0 for plain HTTP (only works with http://localhost or http://127.0.0.1). */
function isDevHttpsDisabled(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase()
  return v === '0' || v === 'false' || v === 'no'
}

// Dev server proxies Frappe routes so the SPA and API share origin and session cookies.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devHttpsDisabled = isDevHttpsDisabled(env.VITE_DEV_HTTPS)

  const certPath = env.VITE_DEV_SSL_CERT?.trim()
  const keyPath = env.VITE_DEV_SSL_KEY?.trim()
  const customSsl =
    Boolean(certPath && keyPath) &&
    fs.existsSync(certPath!) &&
    fs.existsSync(keyPath!)

  const sslDomains = (env.VITE_DEV_SSL_DOMAINS?.split(',') ?? [])
    .map((s) => s.trim())
    .filter(Boolean)

  const useBasicSsl = !customSsl && !devHttpsDisabled

  return {
    plugins: [
      react(),
      ...(useBasicSsl
        ? [basicSsl(sslDomains.length ? { domains: sslDomains } : {})]
        : []),
    ],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy: proxyOptions,
      ...(customSsl
        ? {
            https: {
              cert: fs.readFileSync(certPath!),
              key: fs.readFileSync(keyPath!),
            },
          }
        : {}),
    },
    // So `vite preview` can use same-origin /api proxying like dev (when Frappe URL is empty / same-origin mode).
    preview: {
      host: '0.0.0.0',
      port: 4173,
      strictPort: false,
      proxy: proxyOptions,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // Lower peak RAM during `vite build` (helps constrained Windows / CI agents).
    build: {
      sourcemap: false,
      reportCompressedSize: false,
      rollupOptions: {
        maxParallelFileOps: 2,
      },
    },
    esbuild: {
      legalComments: 'none',
    },
  }
})
