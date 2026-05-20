import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { ProxyOptions } from 'vite'

/** Vite dev proxy: forward Frappe paths to the local bench webserver port. */
const __dirname = path.dirname(fileURLToPath(import.meta.url))

function resolveWebserverPort(): string {
  const fromEnv = process.env.FRAPPE_WEBSERVER_PORT?.trim()
  if (fromEnv) {
    return fromEnv
  }
  const candidates = [
    path.resolve(__dirname, '../../../sites/common_site_config.json'),
    path.resolve(__dirname, '../../../../sites/common_site_config.json'),
  ]
  for (const configPath of candidates) {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8')
        const json = JSON.parse(raw) as { webserver_port?: number }
        if (json.webserver_port != null) {
          return String(json.webserver_port)
        }
      }
    } catch {
      /* ignore */
    }
  }
  return '8000'
}

const webserver_port = resolveWebserverPort()

function readDotEnvValue(key: string): string | undefined {
  const envPath = path.resolve(__dirname, '.env')
  try {
    if (!fs.existsSync(envPath)) {
      return undefined
    }
    const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)
    const match = lines.find((line) => line.startsWith(`${key}=`))
    if (!match) {
      return undefined
    }
    return match.slice(key.length + 1).trim()
  } catch {
    return undefined
  }
}

function resolveFrappeTargetOrigin(): string {
  const direct =
    process.env.FRAPPE_TARGET_URL?.trim() ||
    process.env.VITE_FRAPPE_URL?.trim() ||
    process.env.VITE_FRAPPE_BASE_URL?.trim() ||
    readDotEnvValue('FRAPPE_TARGET_URL') ||
    readDotEnvValue('VITE_FRAPPE_URL') ||
    readDotEnvValue('VITE_FRAPPE_BASE_URL')
  if (direct) {
    return direct.replace(/\/+$/, '')
  }
  return `http://127.0.0.1:${webserver_port}`
}

const frappeTargetOrigin = resolveFrappeTargetOrigin()

/**
 * Vite matches proxy keys with `url.startsWith(context)` unless the key starts with `^` (regex).
 * A single broad regex can fail to register or match as expected; `/api` must always hit Frappe
 * so `/api/method/...` is never answered with the SPA `index.html`.
 */
const frappeProxy: ProxyOptions = {
  target: frappeTargetOrigin,
  /** Frappe resolves the site from the Host header; without this, requests keep :5173 and the wrong site can load. */
  changeOrigin: true,
  ws: true,
  router(req: { headers: { host?: string } }) {
    if (frappeTargetOrigin !== `http://127.0.0.1:${webserver_port}`) {
      return frappeTargetOrigin
    }
    const site_name = req.headers.host?.split(':')[0] ?? '127.0.0.1'
    return `http://${site_name}:${webserver_port}`
  },
}

export default {
  '/api': frappeProxy,
  '/assets': frappeProxy,
  '/files': frappeProxy,
  '/private': frappeProxy,
  /** Frappe desk routes; regex avoids catching the SPA route `/applications`. */
  '^/app/': frappeProxy,
  '^/app$': frappeProxy,
} satisfies Record<string, ProxyOptions>
