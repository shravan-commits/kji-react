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

/** cert.pem + key.pem in project root, or VITE_DEV_SSL_CERT / VITE_DEV_SSL_KEY. */
function resolveCustomHttps(
  env: Record<string, string>,
  rootDir: string,
): { cert: Buffer; key: Buffer } | undefined {
  let certPath = env.VITE_DEV_SSL_CERT?.trim()
  let keyPath = env.VITE_DEV_SSL_KEY?.trim()
  if (!certPath || !keyPath) {
    const defaultCert = path.resolve(rootDir, 'cert.pem')
    const defaultKey = path.resolve(rootDir, 'key.pem')
    if (fs.existsSync(defaultCert) && fs.existsSync(defaultKey)) {
      certPath = defaultCert
      keyPath = defaultKey
    }
  }
  if (!certPath || !keyPath || !fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    return undefined
  }
  return {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  }
}

// Dev server proxies Frappe routes so the SPA and API share origin and session cookies.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devHttpsDisabled = isDevHttpsDisabled(env.VITE_DEV_HTTPS)

  const customHttps = resolveCustomHttps(env, process.cwd())
  const customSsl = Boolean(customHttps)

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
      ...(customHttps ? { https: customHttps } : {}),
    },
    // `npm run serve:dist` — static dist + /api proxy (replaces `npx serve -s`, which returns index.html for /api).
    // Exclude /assets from preview proxy: built JS/CSS lives in dist/assets/ and must be served locally.
    preview: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy: Object.fromEntries(
        Object.entries(proxyOptions).filter(([k]) => k !== '/assets'),
      ),
      ...(customHttps ? { https: customHttps } : {}),
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
