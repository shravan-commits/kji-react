/**
 * URL passed to frappe-react-sdk FrappeProvider.
 * - Dev + Vite proxy (Doppio-style): empty string → requests use the dev server origin; proxy forwards to Frappe.
 * - Prod / direct API: set VITE_FRAPPE_URL or VITE_FRAPPE_BASE_URL.
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

/** True when realtime (socket.io) should be enabled — mint-style; needs site + port in dev. */
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
