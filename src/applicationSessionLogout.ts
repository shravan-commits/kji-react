import {
  getKeycloakIdTokenForLogoutHint,
  resolveOpenIdConnectEndSessionUrl,
  resolvePortalLogoutLandingUrl,
} from './keycloakAuth'
import { APP_LOGOUT_NAVIGATION_GRACE_MS } from './portalLogoutSync'
import { resolveFrappePostMessageOrigins } from './frappeSdk'

/** Origins of ERP tabs opened from this browser during the current portal session. */
const ACTIVE_APP_SITES_KEY = 'kalyan-portal:active-app-sites' as const

/** Remember an application origin opened from the portal (shared across portal tabs via sessionStorage). */
export function registerOpenedApplicationSession(launchUrl: string) {
  const origin = resolveApplicationSiteOrigin(launchUrl)
  if (!origin || typeof sessionStorage === 'undefined') {
    return
  }
  try {
    const raw = sessionStorage.getItem(ACTIVE_APP_SITES_KEY)
    const sites = new Set<string>(
      raw ? (JSON.parse(raw) as string[]).filter((x) => typeof x === 'string' && x) : [],
    )
    sites.add(origin)
    sessionStorage.setItem(ACTIVE_APP_SITES_KEY, JSON.stringify([...sites]))
  } catch {
    // Ignore storage failures.
  }
}

function readRegisteredApplicationSiteOrigins(): string[] {
  if (typeof sessionStorage === 'undefined') {
    return []
  }
  try {
    const raw = sessionStorage.getItem(ACTIVE_APP_SITES_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0)
  } catch {
    return []
  }
}

/** Clears per-session application origin registry after global logout. */
export function clearRegisteredApplicationSessions() {
  if (typeof sessionStorage === 'undefined') {
    return
  }
  try {
    sessionStorage.removeItem(ACTIVE_APP_SITES_KEY)
  } catch {
    // Ignore.
  }
}

/** Frappe site origin from a Keycloak authorize URL or direct app launch URL. */
export function resolveApplicationSiteOrigin(launchUrl: string): string | null {
  try {
    const parsed = new URL(launchUrl, typeof window !== 'undefined' ? window.location.href : undefined)
    const redirectUriParam = parsed.searchParams.get('redirect_uri')
    if (redirectUriParam) {
      return new URL(decodeURIComponent(redirectUriParam)).origin
    }
    if (
      parsed.pathname.includes('/protocol/openid-connect/auth') ||
      parsed.pathname.includes('/login_via_keycloak')
    ) {
      return null
    }
    return parsed.origin
  } catch {
    return null
  }
}

export function getClientIdFromLaunchUrl(launchUrl?: string): string {
  if (!launchUrl) {
    return ''
  }
  try {
    const parsed = new URL(launchUrl, typeof window !== 'undefined' ? window.location.href : undefined)
    return parsed.searchParams.get('client_id')?.trim() || ''
  } catch {
    return ''
  }
}

/**
 * Frappe Keycloak SSO logout URL for a tab opened from {@code launchUrl}.
 * Ends the ERP session on the Frappe origin and propagates Keycloak RP logout when configured.
 */
export function resolveApplicationLogoutUrl(launchUrl: string): string | null {
  const siteOrigin = resolveApplicationSiteOrigin(launchUrl)
  if (!siteOrigin) {
    return null
  }
  const redirectTo = resolvePortalLogoutLandingUrl()
  return `${siteOrigin}/api/method/keycloak_integration.utils.sso_logout?redirect_to=${encodeURIComponent(redirectTo)}`
}

/** Best logout navigation for a child window: Frappe sso_logout when derivable; else Keycloak RP logout. */
export function resolveTrackedWindowLogoutUrl(launchUrl: string): string | null {
  const frappeLogout = resolveApplicationLogoutUrl(launchUrl)
  let keycloakOrigin = ''
  try {
    const kb = import.meta.env.VITE_KEYCLOAK_URL?.trim()
    if (kb) {
      keycloakOrigin = new URL(kb).origin
    }
  } catch {
    keycloakOrigin = ''
  }

  const clientId = getClientIdFromLaunchUrl(launchUrl) || undefined
  const oidcLogout = () =>
    resolveOpenIdConnectEndSessionUrl({
      postLogoutRedirectUri: resolvePortalLogoutLandingUrl(),
      idTokenHint: getKeycloakIdTokenForLogoutHint(),
      clientId,
    }) ?? null

  if (frappeLogout) {
    try {
      const fu = new URL(frappeLogout)
      const misbuiltFrappeOnKeycloakHost =
        Boolean(keycloakOrigin) &&
        fu.origin === keycloakOrigin &&
        fu.pathname.includes('keycloak_integration')
      if (misbuiltFrappeOnKeycloakHost) {
        return oidcLogout() ?? frappeLogout
      }
    } catch {
      return frappeLogout
    }
    return frappeLogout
  }

  try {
    const launch = new URL(launchUrl, typeof window !== 'undefined' ? window.location.href : undefined)
    const onKeycloak =
      Boolean(keycloakOrigin) &&
      (launch.origin === keycloakOrigin ||
        launch.pathname.includes('/protocol/openid-connect/auth'))
    if (onKeycloak) {
      return oidcLogout()
    }
  } catch {
    return null
  }
  return null
}

/** All Frappe (or app) site origins from env — used to end sessions in tabs not tracked by the portal. */
export function collectConfiguredApplicationSiteOrigins(): Set<string> {
  const out = new Set<string>()
  const env = import.meta.env
  const launchUrls = [
    env.VITE_APP_HR_URL,
    env.VITE_APP_WAREHOUSE_URL,
    env.VITE_APP_SALES_URL,
    env.VITE_APP_FINANCE_URL,
  ]
  for (const raw of launchUrls) {
    const trimmed = raw?.trim()
    if (!trimmed) {
      continue
    }
    const origin = resolveApplicationSiteOrigin(trimmed)
    if (origin) {
      out.add(origin)
    }
    try {
      const direct = new URL(trimmed, typeof window !== 'undefined' ? window.location.href : undefined)
      if (!direct.pathname.includes('/protocol/openid-connect/auth')) {
        out.add(direct.origin)
      }
    } catch {
      // ignore
    }
  }
  for (const origin of resolveFrappePostMessageOrigins()) {
    if (origin) {
      out.add(origin)
    }
  }
  for (const origin of readRegisteredApplicationSiteOrigins()) {
    out.add(origin)
  }
  return out
}

function buildFrappeSsoLogoutUrl(siteOrigin: string): string {
  const redirectTo = resolvePortalLogoutLandingUrl()
  return `${siteOrigin.replace(/\/+$/, '')}/api/method/keycloak_integration.utils.sso_logout?redirect_to=${encodeURIComponent(redirectTo)}`
}

const fanOutIframeTimers = new Set<ReturnType<typeof setTimeout>>()

/**
 * Best-effort logout for ERP tabs opened outside {@code window.open} tracking (e.g. duplicate tab).
 * First-party navigation in tracked windows remains the primary path.
 */
export function fanOutBestEffortApplicationLogouts(origins?: Iterable<string>) {
  if (typeof document === 'undefined') {
    return
  }
  const targets = origins ? new Set(origins) : collectConfiguredApplicationSiteOrigins()
  for (const origin of targets) {
    if (!origin) {
      continue
    }
    const url = buildFrappeSsoLogoutUrl(origin)
    try {
      const iframe = document.createElement('iframe')
      iframe.setAttribute('aria-hidden', 'true')
      iframe.setAttribute('title', '')
      iframe.style.cssText =
        'position:absolute;width:0;height:0;border:0;clip:rect(0,0,0,0);overflow:hidden'
      iframe.src = url
      document.body.appendChild(iframe)
      const timer = window.setTimeout(() => {
        fanOutIframeTimers.delete(timer)
        iframe.remove()
      }, 25000)
      fanOutIframeTimers.add(timer)
    } catch {
      // Ignore per-origin failures; tracked windows and Keycloak RP logout still run.
    }
  }
}

export type TrackedApplicationWindow = {
  window: Window
  launchUrl: string
}

/** Navigate tracked ERP/Keycloak app tabs to logout; fan out to all configured app origins. */
export function terminateApplicationSessions(tracked: TrackedApplicationWindow[]) {
  const landingUrl = resolvePortalLogoutLandingUrl()
  const oidcFallback =
    resolveOpenIdConnectEndSessionUrl({
      postLogoutRedirectUri: landingUrl,
      idTokenHint: getKeycloakIdTokenForLogoutHint(),
    }) ?? null

  for (const entry of tracked) {
    if (entry.window.closed) {
      continue
    }
    const url = resolveTrackedWindowLogoutUrl(entry.launchUrl) || oidcFallback
    if (!url) {
      continue
    }
    try {
      entry.window.location.replace(url)
    } catch {
      try {
        entry.window.location.assign(url)
      } catch {
        // Ignore per-window navigation errors; central logout still proceeds.
      }
    }
  }

  const allOrigins = collectConfiguredApplicationSiteOrigins()
  fanOutBestEffortApplicationLogouts(allOrigins)
  window.setTimeout(() => {
    fanOutBestEffortApplicationLogouts(allOrigins)
  }, APP_LOGOUT_NAVIGATION_GRACE_MS)
  clearRegisteredApplicationSessions()
}
