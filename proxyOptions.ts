import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

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

// Require a segment boundary after `app` (etc.) so `/applications` is not proxied to Frappe.
export default {
  '^/(app|api|assets|files|private)(/|$)': {
    target: `http://127.0.0.1:${webserver_port}`,
    ws: true,
    router(req: { headers: { host?: string } }) {
      const site_name = req.headers.host?.split(':')[0] ?? '127.0.0.1'
      return `http://${site_name}:${webserver_port}`
    },
  },
}
