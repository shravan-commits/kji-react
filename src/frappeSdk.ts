function truthyEnvFlag(value: string | undefined) {
  const v = value?.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

/**
 * URL passed to frappe-react-sdk FrappeProvider.
 * - Same-origin API: set VITE_FRAPPE_SAME_ORIGIN_API=true → empty string; browser calls `/api` on the
 *   portal host and Vite (dev/preview) or nginx proxies to Frappe. Avoids mixed-content and many CORS issues.
 * - Development default: empty string (Vite proxy) when VITE_FRAPPE_URL is unset.
 * - Direct cross-origin API: set VITE_FRAPPE_URL or (production) VITE_FRAPPE_BASE_URL — requires HTTPS↔HTTP
 *   alignment, Frappe CORS + credentials if using cookies, or VITE_FRAPPE_TOKEN / bearer integration.
 */
export function resolveFrappeProviderUrl(): string {
  const explicit = import.meta.env.VITE_FRAPPE_URL?.trim()
  if (explicit) {
    return explicit.replace(/\/+$/, '')
  }
  if (truthyEnvFlag(import.meta.env.VITE_FRAPPE_SAME_ORIGIN_API)) {
    return ''
  }
  if (import.meta.env.DEV) {
    return ''
  }
  const base = import.meta.env.VITE_FRAPPE_BASE_URL?.trim() || ''
  return base.replace(/\/+$/, '')
}

/**
 * When the SPA is HTTPS but Frappe API base URL is HTTP, browsers block `fetch` (mixed content).
 */
export function getFrappeApiLikelyBlocker(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  const base = resolveFrappeProviderUrl()
  if (!base) {
    return undefined
  }
  try {
    const u = new URL(base, window.location.origin)
    if (window.location.protocol === 'https:' && u.protocol === 'http:') {
      return 'Mixed content: this portal is loaded over HTTPS but the Frappe API URL is HTTP, so the browser blocks API calls. Fix: use HTTPS for Frappe, or set VITE_FRAPPE_SAME_ORIGIN_API=true and proxy /api on the portal host (Vite dev/preview or nginx).'
    }
  } catch {
    return undefined
  }
  return undefined
}

function tryAddPostMessageOrigin(out: Set<string>, raw: string | undefined) {
  const trimmed = raw?.trim()
  if (!trimmed) {
    return
  }
  try {
    const url = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`)
    out.add(url.origin)
  } catch {
    // ignore invalid URL
  }
}

/**
 * Browser origins allowed to send `postMessage` to this portal when an ERP tab reports logout.
 * Must include the Frappe site origin (e.g. from VITE_FRAPPE_BASE_URL).
 */
export function resolveFrappePostMessageOrigins(): string[] {
  const out = new Set<string>()
  tryAddPostMessageOrigin(out, import.meta.env.VITE_FRAPPE_BASE_URL)
  tryAddPostMessageOrigin(out, import.meta.env.VITE_FRAPPE_URL)
  const extra = import.meta.env.VITE_FRAPPE_LOGOUT_MESSAGE_ORIGINS?.split(',') ?? []
  for (const part of extra) {
    tryAddPostMessageOrigin(out, part.trim())
  }
  return [...out]
}

type FrappeTokenParams = {
  useToken: true
  token: () => string
  type: 'Bearer' | 'token'
}

/**
 * Optional token auth for Frappe SDK calls.
 * Useful when app auth is handled by Keycloak and no Frappe session cookie exists.
 */
export function resolveFrappeTokenParams(): FrappeTokenParams | undefined {
  const rawToken = import.meta.env.VITE_FRAPPE_TOKEN?.trim()
  if (!rawToken) {
    return undefined
  }
  const rawType = import.meta.env.VITE_FRAPPE_TOKEN_TYPE?.trim().toLowerCase()
  const type: 'Bearer' | 'token' = rawType === 'token' ? 'token' : 'Bearer'
  return {
    useToken: true,
    token: () => rawToken,
    type,
  }
}

/** True when the SDK should open a Socket.IO connection (site name + port in dev). */
export function resolveFrappeEnableSocket(): boolean {
  if (import.meta.env.VITE_FRAPPE_ENABLE_SOCKET === 'false') {
    return false
  }
  if (import.meta.env.VITE_FRAPPE_ENABLE_SOCKET === 'true') {
    return true
  }
  return Boolean(
    import.meta.env.VITE_SITE_NAME?.trim() && import.meta.env.VITE_SOCKET_PORT?.trim(),
  )
}
