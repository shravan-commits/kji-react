/** Cross-tab signal when the central portal or Keycloak SSO session ends. */
export const PORTAL_LOGOUT_SYNC_KEY = 'kalyan-portal:logout-sync' as const

const PORTAL_LOGOUT_BROADCAST_CHANNEL = 'kalyan-portal:sso-logout' as const

/** Time for ERP tabs to start {@code sso_logout} before the portal redirects to Keycloak. */
export const APP_LOGOUT_NAVIGATION_GRACE_MS = 320

export function waitForApplicationLogoutNavigation(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, APP_LOGOUT_NAVIGATION_GRACE_MS)
  })
}

/**
 * Notifies other portal tabs (localStorage + BroadcastChannel) that central logout started.
 * ERP tabs are ended separately via {@link terminateApplicationSessions}.
 */
export function broadcastCentralPortalLogout() {
  const stamp = String(Date.now())
  try {
    localStorage.setItem(PORTAL_LOGOUT_SYNC_KEY, stamp)
  } catch {
    // Ignore quota / private mode.
  }
  try {
    const channel = new BroadcastChannel(PORTAL_LOGOUT_BROADCAST_CHANNEL)
    channel.postMessage({ type: 'central-logout', t: stamp })
    channel.close()
  } catch {
    // BroadcastChannel unavailable in very old browsers.
  }
}

/** Subscribe to central logout from another portal tab (same origin). */
export function installCentralPortalLogoutBroadcastListener(handler: () => void) {
  if (typeof window === 'undefined') {
    return () => {}
  }
  let channel: BroadcastChannel | undefined
  try {
    channel = new BroadcastChannel(PORTAL_LOGOUT_BROADCAST_CHANNEL)
    channel.onmessage = () => {
      handler()
    }
  } catch {
    return () => {}
  }
  return () => {
    channel?.close()
    channel = undefined
  }
}
