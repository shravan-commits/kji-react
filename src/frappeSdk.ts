/**
 * URL passed to frappe-react-sdk FrappeProvider.
 * - Development: default empty string → browser targets the Vite dev server; proxy forwards to Frappe.
 * - Production / direct API: set VITE_FRAPPE_URL or VITE_FRAPPE_BASE_URL.
 */
export function resolveFrappeProviderUrl(): string {
  const explicit = import.meta.env.VITE_FRAPPE_URL?.trim()
  if (explicit) {
    return explicit.replace(/\/+$/, '')
  }
  if (import.meta.env.DEV) {
    return ''
  }
  const base = import.meta.env.VITE_FRAPPE_BASE_URL?.trim() || ''
  return base.replace(/\/+$/, '')
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
