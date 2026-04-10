/** When true, skips Frappe session / redirect and Keycloak gate (UI-only demo). Remove via VITE_DEMO_MODE when integrating backends. */
export function isDemoMode() {
  const v = import.meta.env.VITE_DEMO_MODE?.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}
