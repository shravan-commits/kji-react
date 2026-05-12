import Keycloak from 'keycloak-js'
import type { KeycloakTokenParsed } from 'keycloak-js'
import { resolveFrappePostMessageOrigins } from './frappeSdk'

type KeycloakInitResult = {
  authenticated: boolean
}

type TokenEndpointResponse = {
  access_token: string
  refresh_token?: string
  id_token?: string
  error?: string
  error_description?: string
}

type KeycloakConfig = {
  url: string
  realm: string
  clientId: string
}

function canUsePkceS256() {
  return typeof window !== 'undefined' && Boolean(window.crypto?.subtle)
}

function truthyEnv(value: string | undefined) {
  const v = value?.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

/**
 * When true, Keycloak-js polls a hidden iframe so if the user ends the realm SSO session from
 * another app (without focusing this tab), this tab can still clear tokens. May be blocked by
 * strict third‑party cookie policies in some browsers — test before enabling in production.
 */
function resolveKeycloakCheckLoginIframe() {
  return truthyEnv(import.meta.env.VITE_KEYCLOAK_CHECK_LOGIN_IFRAME)
}

/** Polling interval in seconds for the session iframe (Keycloak default is 5). */
function resolveKeycloakCheckLoginIframeIntervalSec() {
  const raw = import.meta.env.VITE_KEYCLOAK_CHECK_LOGIN_IFRAME_INTERVAL_SEC?.trim()
  const n = Number(raw)
  if (Number.isFinite(n) && n >= 3) {
    return n
  }
  return undefined
}

/**
 * Periodic forced token refresh (ms). Min 15s.
 * When unset, defaults to 45s so the portal notices Keycloak SSO ended elsewhere without extra env.
 * Set to 0 / false / off to disable.
 */
function resolveSsoProbeIntervalMs() {
  const raw = import.meta.env.VITE_KEYCLOAK_SSO_PROBE_INTERVAL_MS?.trim()
  if (!raw) {
    return 45000
  }
  const lowered = raw.toLowerCase()
  if (lowered === '0' || lowered === 'false' || lowered === 'off' || lowered === 'no') {
    return 0
  }
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 15000) {
    return 0
  }
  return Math.floor(n)
}

function resolveKeycloakInitOptions() {
  const checkLoginIframe = resolveKeycloakCheckLoginIframe()
  const iframeIntervalSec = resolveKeycloakCheckLoginIframeIntervalSec()
  return {
    checkLoginIframe,
    ...(iframeIntervalSec !== undefined
      ? { checkLoginIframeInterval: iframeIntervalSec }
      : {}),
    redirectUri: resolveKeycloakLoginRedirectUri(),
    ...(canUsePkceS256() ? { pkceMethod: 'S256' as const } : {}),
  }
}

function resolvePortalAvailabilityTimeoutMs() {
  const raw = import.meta.env.VITE_KEYCLOAK_AVAILABILITY_TIMEOUT_MS?.trim()
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 5000
  }
  return parsed
}

function normalizeEnvValue(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

/**
 * URL Keycloak redirects to after successful login (must exactly match a "Valid redirect URI"
 * on the Keycloak client — use http://localhost:5173/applications for local Vite dev).
 */
export function resolveKeycloakLoginRedirectUri() {
  const fromEnv = import.meta.env.VITE_KEYCLOAK_REDIRECT_URI?.trim()
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, '')
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:5173/applications'
  }
  return `${window.location.origin.replace(/\/+$/, '')}/applications`
}

function resolveRedirectUri() {
  return resolveKeycloakLoginRedirectUri()
}

/** OIDC scopes requested during browser login. */
function resolveKeycloakRequestedScope() {
  const fromEnv = import.meta.env.VITE_KEYCLOAK_SCOPE?.trim()
  if (fromEnv) {
    return fromEnv
  }
  return 'openid email profile location-scope'
}

function resolvePostLogoutRedirectUri() {
  return (
    import.meta.env.VITE_KEYCLOAK_POST_LOGOUT_REDIRECT_URI?.trim() ||
    window.location.origin
  )
}

/**
 * Keycloak origin (no trailing slash). In dev, defaults to docker-compose port 8081
 * so "Login with Keycloak" hits http://localhost:8081/... even if VITE_KEYCLOAK_URL is unset.
 */
function resolveKeycloakServerOrigin(): string | undefined {
  const explicit = normalizeEnvValue(import.meta.env.VITE_KEYCLOAK_URL)?.replace(/\/+$/, '')
  if (explicit) {
    return explicit
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:8080'
  }
  return undefined
}

function getKeycloakConfig(): KeycloakConfig | null {
  const url = resolveKeycloakServerOrigin()
  const realm = normalizeEnvValue(import.meta.env.VITE_KEYCLOAK_REALM)
  const clientId = normalizeEnvValue(import.meta.env.VITE_KEYCLOAK_CLIENT_ID)
  if (!url || !realm || !clientId) {
    return null
  }
  return { url, realm, clientId }
}

/** False when any of the Keycloak env vars are missing (portal cannot complete SSO). */
export function isKeycloakConfigured(): boolean {
  return getKeycloakConfig() !== null
}

/**
 * Frappe (or another trusted app tab) should call:
 * `window.opener.postMessage(KALYAN_PORTAL_SSO_ENDED_MESSAGE, '<portal origin>')`
 * after logout so this portal tab can end Keycloak SSO too. Requires opening apps without `noopener`
 * so `window.opener` is set.
 */
export const KALYAN_PORTAL_SSO_ENDED_MESSAGE = 'kalyan-portal:sso-ended' as const

let keycloak: Keycloak | null = null

/** Notified when Keycloak clears this tab’s session (logout elsewhere, refresh failure, etc.). */
const sessionLostListeners = new Set<() => void>()
let wiredKeycloakInstance: Keycloak | null = null
let documentSessionHooksInstalled = false
let forcedProbeDebounceTimer: ReturnType<typeof setTimeout> | undefined
let ssoProbeIntervalId: ReturnType<typeof setInterval> | undefined

function clearSsoProbeInterval() {
  if (ssoProbeIntervalId !== undefined) {
    window.clearInterval(ssoProbeIntervalId)
    ssoProbeIntervalId = undefined
  }
}

function startSsoProbeIntervalIfConfigured() {
  clearSsoProbeInterval()
  const intervalMs = resolveSsoProbeIntervalMs()
  if (intervalMs <= 0) {
    return
  }
  const kc = keycloak
  if (!kc?.authenticated) {
    return
  }
  ssoProbeIntervalId = window.setInterval(() => {
    const client = keycloak
    if (!client?.authenticated) {
      clearSsoProbeInterval()
      return
    }
    void client.updateToken(-1).catch(() => {
      if (!client.authenticated) {
        clearSsoProbeInterval()
      }
    })
  }, intervalMs)
}

function emitKeycloakSessionLost() {
  clearSsoProbeInterval()
  for (const listener of sessionLostListeners) {
    try {
      listener()
    } catch {
      // Ignore listener errors so one bad callback does not break others.
    }
  }
}

function scheduleForcedKeycloakSessionProbe() {
  const kc = keycloak
  if (!kc?.authenticated) {
    return
  }
  window.clearTimeout(forcedProbeDebounceTimer)
  forcedProbeDebounceTimer = window.setTimeout(() => {
    forcedProbeDebounceTimer = undefined
    void kc.updateToken(-1).catch(() => {
      if (!kc.authenticated) {
        emitKeycloakSessionLost()
      }
    })
  }, 120)
}

function installDocumentSessionProbeHooks() {
  if (documentSessionHooksInstalled || typeof document === 'undefined') {
    return
  }
  documentSessionHooksInstalled = true

  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      scheduleForcedKeycloakSessionProbe()
    }
  }

  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('focus', scheduleForcedKeycloakSessionProbe)
  window.addEventListener('pageshow', (event: PageTransitionEvent) => {
    if (event.persisted || document.visibilityState === 'visible') {
      scheduleForcedKeycloakSessionProbe()
    }
  })
}

/**
 * Subscribe to loss of the Keycloak session in this browser tab — for example after the user
 * signs out from a linked application (Frappe) that ends the realm SSO session, so the next
 * forced token refresh fails and the portal should show the login screen again.
 */
export function subscribeKeycloakSessionLost(listener: () => void) {
  sessionLostListeners.add(listener)
  return () => {
    sessionLostListeners.delete(listener)
  }
}

function wireKeycloakSessionSync(kc: Keycloak) {
  if (wiredKeycloakInstance !== kc) {
    wiredKeycloakInstance = kc

    const previousLogout = kc.onAuthLogout
    kc.onAuthLogout = function onAuthLogoutHandler() {
      previousLogout?.call(kc)
      emitKeycloakSessionLost()
    }
  }

  installDocumentSessionProbeHooks()
  if (kc.authenticated) {
    startSsoProbeIntervalIfConfigured()
  } else {
    clearSsoProbeInterval()
  }
}

/** Fields used at runtime but omitted from published .d.ts. */
type KeycloakRuntime = Keycloak & {
  tokenTimeoutHandle?: number
  endpoints: { token: () => string }
}

function asRuntime(k: Keycloak | null): KeycloakRuntime | null {
  return k as KeycloakRuntime | null
}

let keycloakInitialized = false

export async function initializeKeycloak(): Promise<KeycloakInitResult> {
  if (keycloakInitialized) {
    if (keycloak) {
      wireKeycloakSessionSync(keycloak)
    }
    return { authenticated: Boolean(keycloak?.authenticated) }
  }

  const config = getKeycloakConfig()
  if (!config) {
    keycloakInitialized = true
    return { authenticated: false }
  }

  keycloak = new Keycloak(config)
  // Keep default `onLoad` (no silent `check-sso`) so first visit still shows "Login with Keycloak".
  // redirectUri must match the authorize request so the callback on /applications exchanges the code.
  await keycloak.init(resolveKeycloakInitOptions())
  keycloakInitialized = true
  wireKeycloakSessionSync(keycloak)

  return { authenticated: Boolean(keycloak.authenticated) }
}

export function isKeycloakAuthenticated() {
  return Boolean(keycloak?.authenticated)
}

export async function loginWithKeycloak() {
  const config = getKeycloakConfig()
  if (!config) {
    throw new Error(
      'Keycloak is not configured. Set VITE_KEYCLOAK_URL (e.g. http://localhost:8081), VITE_KEYCLOAK_REALM, and VITE_KEYCLOAK_CLIENT_ID.',
    )
  }

  // In dev, HMR can preserve module state; recreate client if env-backed config changed.
  if (
    !keycloak ||
    keycloak.clientId !== config.clientId ||
    keycloak.authServerUrl !== config.url ||
    keycloak.realm !== config.realm
  ) {
    keycloak = new Keycloak(config)
    await keycloak.init(resolveKeycloakInitOptions())
    keycloakInitialized = true
  }

  wireKeycloakSessionSync(keycloak)

  const href = await keycloak.createLoginUrl({
    redirectUri: resolveRedirectUri(),
    scope: resolveKeycloakRequestedScope(),
  })
  window.location.assign(href)
}

export async function isCentralPortalReachable() {
  const config = getKeycloakConfig()
  if (!config) {
    return false
  }

  const controller = new AbortController()
  const timeoutHandle = window.setTimeout(() => {
    controller.abort()
  }, resolvePortalAvailabilityTimeoutMs())

  try {
    const response = await fetch(
      `${config.url}/realms/${encodeURIComponent(config.realm)}/.well-known/openid-configuration`,
      {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      },
    )
    return response.ok
  } catch (error) {
    // Timeout should not force the maintenance screen; allow login flow to continue.
    if (error instanceof DOMException && error.name === 'AbortError') {
      return true
    }
    return false
  } finally {
    clearTimeout(timeoutHandle)
  }
}

export function isKeycloakUnavailableError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }
  const message = error.message.toLowerCase()
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network error') ||
    message.includes('timeout') ||
    message.includes('fetch')
  )
}

function base64UrlDecode(input: string) {
  let output = input.replaceAll('-', '+').replaceAll('_', '/')
  switch (output.length % 4) {
    case 0:
      break
    case 2:
      output += '=='
      break
    case 3:
      output += '='
      break
    default:
      throw new Error('Invalid JWT payload length.')
  }
  try {
    return decodeURIComponent(
      atob(output).replace(/(.)/g, (_m, p: string) => {
        const code = p.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')
        return '%' + code
      }),
    )
  } catch {
    return atob(output)
  }
}

function decodeJwt(token: string): KeycloakTokenParsed {
  const parts = token.split('.')
  const payload = parts[1]
  if (typeof payload !== 'string') {
    throw new Error('Invalid token.')
  }
  return JSON.parse(base64UrlDecode(payload)) as KeycloakTokenParsed
}

function applyTokenResponse(data: Pick<TokenEndpointResponse, 'access_token' | 'refresh_token' | 'id_token'>) {
  const kc = asRuntime(keycloak)
  if (!kc) {
    return
  }

  if (kc.tokenTimeoutHandle) {
    clearTimeout(kc.tokenTimeoutHandle)
    kc.tokenTimeoutHandle = undefined
  }

  const timeLocal = Date.now()

  if (data.refresh_token) {
    kc.refreshToken = data.refresh_token
    kc.refreshTokenParsed = decodeJwt(data.refresh_token)
  } else {
    delete kc.refreshToken
    delete kc.refreshTokenParsed
  }

  if (data.id_token) {
    kc.idToken = data.id_token
    kc.idTokenParsed = decodeJwt(data.id_token)
  } else {
    delete kc.idToken
    delete kc.idTokenParsed
  }

  kc.token = data.access_token
  kc.tokenParsed = decodeJwt(data.access_token)
  kc.sessionId = kc.tokenParsed.sid as string | undefined
  kc.authenticated = true
  kc.subject = kc.tokenParsed.sub
  kc.realmAccess = kc.tokenParsed.realm_access
  kc.resourceAccess = kc.tokenParsed.resource_access
  kc.timeSkew = Math.floor(timeLocal / 1000) - (kc.tokenParsed.iat ?? 0)

  if (kc.onTokenExpired && kc.tokenParsed.exp != null) {
    const expiresIn =
      (kc.tokenParsed.exp - Date.now() / 1000 + (kc.timeSkew ?? 0)) * 1000
    if (expiresIn > 0) {
      kc.tokenTimeoutHandle = window.setTimeout(() => {
        asRuntime(keycloak)?.onTokenExpired?.()
      }, expiresIn)
    } else {
      kc.onTokenExpired()
    }
  }
}

/**
 * Sign in with username/password inside this SPA (no redirect to Keycloak UI).
 * Requires the client to have **Direct access grants** enabled, **Web origins** to include
 * this app’s origin, and (for most setups) a **public** client.
 */
export async function loginWithKeycloakPassword(username: string, password: string) {
  const kc = asRuntime(keycloak)
  if (!kc?.clientId) {
    throw new Error(
      'Keycloak is not configured. Set VITE_KEYCLOAK_URL, VITE_KEYCLOAK_REALM, and VITE_KEYCLOAK_CLIENT_ID.',
    )
  }

  const tokenUrl = kc.endpoints.token()
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: kc.clientId,
    username: username.trim(),
    password,
    scope: 'openid',
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  })

  const data = (await response.json()) as TokenEndpointResponse

  if (!response.ok) {
    throw new Error(
      data.error_description || data.error || `Keycloak login failed (${response.status}).`,
    )
  }

  applyTokenResponse(data)
  kc.onAuthSuccess?.()
}

export async function logoutFromKeycloak() {
  if (!keycloak) {
    return
  }

  await keycloak.logout({
    redirectUri: resolvePostLogoutRedirectUri(),
  })
}

let frappeLogoutPostMessageInstalled = false

function isTrustedPortalSsoEndedMessage(data: unknown): boolean {
  if (data === KALYAN_PORTAL_SSO_ENDED_MESSAGE) {
    return true
  }
  if (typeof data !== 'object' || data === null) {
    return false
  }
  return (data as { type?: string }).type === KALYAN_PORTAL_SSO_ENDED_MESSAGE
}

/**
 * Listen for logout signals from Frappe tabs opened from this portal (`window.opener.postMessage`).
 * Allowed `event.origin` values come from {@link resolveFrappePostMessageOrigins}.
 */
export function installFrappeAppLogoutPostMessageListener() {
  if (frappeLogoutPostMessageInstalled || typeof window === 'undefined') {
    return
  }
  const allowed = resolveFrappePostMessageOrigins()
  if (allowed.length === 0) {
    return
  }
  frappeLogoutPostMessageInstalled = true
  window.addEventListener('message', (event: MessageEvent) => {
    if (!allowed.includes(event.origin)) {
      return
    }
    if (!isTrustedPortalSsoEndedMessage(event.data)) {
      return
    }
    void logoutFromKeycloak().catch(() => {
      keycloak?.clearToken()
      emitKeycloakSessionLost()
    })
  })
}

/** Force a Keycloak token refresh (detects ended SSO after an auxiliary window closes). */
export async function forceKeycloakSessionProbeNow() {
  const kc = keycloak
  if (!kc?.authenticated) {
    return
  }
  try {
    await kc.updateToken(-1)
  } catch {
    // After a 400, keycloak-js clears tokens and fires onAuthLogout; other errors leave the session.
    if (!kc.authenticated) {
      emitKeycloakSessionLost()
    }
  }
}

export function getCurrentUserLabel() {
  if (!keycloak) {
    return ''
  }

  const parsed = keycloak.tokenParsed
  if (!parsed) {
    return ''
  }

  const preferredUsername =
    typeof parsed.preferred_username === 'string' ? parsed.preferred_username : ''
  const email = typeof parsed.email === 'string' ? parsed.email : ''

  return preferredUsername || email
}

/** Full name or username from the OIDC token (for profile UI). */
export function getCurrentUserDisplayName() {
  if (!keycloak?.tokenParsed) {
    return ''
  }
  const parsed = keycloak.tokenParsed
  const name = typeof parsed.name === 'string' ? parsed.name : ''
  const preferredUsername =
    typeof parsed.preferred_username === 'string' ? parsed.preferred_username : ''
  const email = typeof parsed.email === 'string' ? parsed.email : ''
  return name || preferredUsername || email
}

/** Designation from token claim (e.g. "DRIVER (PV)"). */
export function getCurrentUserDesignation() {
  const accessDesignation = (keycloak?.tokenParsed as { designation?: unknown } | undefined)
    ?.designation
  if (typeof accessDesignation === 'string' && accessDesignation.trim()) {
    return accessDesignation.trim()
  }
  const idDesignation = (keycloak?.idTokenParsed as { designation?: unknown } | undefined)
    ?.designation
  if (typeof idDesignation === 'string' && idDesignation.trim()) {
    return idDesignation.trim()
  }
  return ''
}

/** OIDC authorized party (`azp`) from token, typically the client/application identifier. */
export function getCurrentAuthorizedParty() {
  const accessAzp = (keycloak?.tokenParsed as { azp?: unknown } | undefined)?.azp
  if (typeof accessAzp === 'string' && accessAzp.trim()) {
    return accessAzp.trim()
  }
  const idAzp = (keycloak?.idTokenParsed as { azp?: unknown } | undefined)?.azp
  if (typeof idAzp === 'string' && idAzp.trim()) {
    return idAzp.trim()
  }
  return ''
}

/**
 * Parses `locations` from the access token claim (same source as Keycloak user attributes when mapped).
 * Supports: string[], a single comma/semicolon/pipe-separated string, or JSON array string.
 */
function parseLocationsClaim(raw: unknown): string[] {
  if (raw === undefined || raw === null) {
    return []
  }
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  if (typeof raw !== 'string') {
    return []
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    return []
  }
  if (trimmed.startsWith('[')) {
    try {
      const parsedJson = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsedJson)) {
        return parsedJson
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
      }
    } catch {
      // Fall through to delimiter split below.
    }
  }
  return trimmed
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

type TokenWithLocationClaims = KeycloakTokenParsed & {
  locations?: unknown
  location?: unknown
  Locations?: unknown
  attributes?: { locations?: unknown; location?: unknown }
  user_attributes?: { locations?: unknown; location?: unknown }
}

type ResourceAccessEntry = {
  roles?: unknown
  locations?: unknown
  location?: unknown
}

type TokenWithResourceAccessClaims = KeycloakTokenParsed & {
  resource_access?: Record<string, ResourceAccessEntry>
}

function extractLocationsFromParsedToken(parsed: TokenWithLocationClaims | undefined) {
  if (!parsed) {
    return []
  }
  const candidates: unknown[] = [
    parsed.locations,
    parsed.location,
    parsed.Locations,
    parsed.attributes?.locations,
    parsed.attributes?.location,
    parsed.user_attributes?.locations,
    parsed.user_attributes?.location,
  ]
  const out = new Set<string>()
  for (const candidate of candidates) {
    for (const location of parseLocationsClaim(candidate)) {
      out.add(location)
    }
  }
  return [...out]
}

function parseLocationsFromUnknownObject(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    return []
  }
  const parsed = payload as TokenWithLocationClaims
  return extractLocationsFromParsedToken(parsed)
}

export type ClientAccessClaims = {
  roles: string[]
  locations: string[]
}

/** Per-client roles/locations from token `resource_access.<client_id>.*` claims. */
export function getCurrentClientAccessClaims() {
  const parsed = keycloak?.tokenParsed as TokenWithResourceAccessClaims | undefined
  if (!parsed?.resource_access) {
    return {} as Record<string, ClientAccessClaims>
  }
  const out: Record<string, ClientAccessClaims> = {}
  for (const [clientId, entry] of Object.entries(parsed.resource_access)) {
    const roles = Array.isArray(entry.roles)
      ? entry.roles.filter((item): item is string => typeof item === 'string')
      : []
    const locations = parseLocationsClaim(entry.locations).concat(
      parseLocationsClaim(entry.location),
    )
    out[clientId] = {
      roles: [...new Set(roles.map((role) => role.trim()).filter(Boolean))],
      locations: [...new Set(locations.map((location) => location.trim()).filter(Boolean))],
    }
  }
  return out
}

/** Locations from token claims mapped by Keycloak (access token first, then id token fallback). */
export function getCurrentUserLocations() {
  if (!keycloak) {
    return []
  }
  const fromAccessToken = extractLocationsFromParsedToken(
    keycloak.tokenParsed as TokenWithLocationClaims | undefined,
  )
  if (fromAccessToken.length > 0) {
    return fromAccessToken
  }
  const fromIdTokenParsed = extractLocationsFromParsedToken(
    keycloak.idTokenParsed as TokenWithLocationClaims | undefined,
  )
  if (fromIdTokenParsed.length > 0) {
    return fromIdTokenParsed
  }
  // Final fallback: decode raw JWT payloads in case runtime parsed objects omit custom claims.
  const fromAccessTokenRaw = extractLocationsFromParsedToken(
    keycloak.token ? (decodeJwt(keycloak.token) as TokenWithLocationClaims) : undefined,
  )
  if (fromAccessTokenRaw.length > 0) {
    return fromAccessTokenRaw
  }
  return extractLocationsFromParsedToken(
    keycloak.idToken ? (decodeJwt(keycloak.idToken) as TokenWithLocationClaims) : undefined,
  )
}

/** Fetches locations from OIDC userinfo endpoint (runtime fallback when token omits custom claims). */
export async function fetchCurrentUserLocationsFromUserInfo() {
  const config = getKeycloakConfig()
  const token = keycloak?.token
  if (!config || !token) {
    return []
  }
  try {
    const response = await fetch(
      `${config.url}/realms/${encodeURIComponent(config.realm)}/protocol/openid-connect/userinfo`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      },
    )
    if (!response.ok) {
      return []
    }
    const payload = (await response.json()) as unknown
    return parseLocationsFromUnknownObject(payload)
  } catch {
    return []
  }
}

function normalizeRoles(value: string | undefined) {
  return (value || '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
}

function getCurrentUserRoles() {
  const parsed = keycloak?.tokenParsed as
    | (KeycloakTokenParsed & {
        realm_access?: { roles?: string[] }
        resource_access?: Record<string, { roles?: string[] }>
      })
    | undefined

  if (!parsed) {
    return new Set<string>()
  }

  const roles = new Set<string>()
  for (const role of parsed.realm_access?.roles || []) {
    roles.add(role)
  }
  for (const clientName of Object.keys(parsed.resource_access || {})) {
    const clientRoles = parsed.resource_access?.[clientName]?.roles || []
    for (const role of clientRoles) {
      roles.add(role)
    }
  }
  return roles
}

export function resolveRequiredRoles(value: string | undefined) {
  return normalizeRoles(value)
}

export function hasCurrentUserAnyRole(requiredRoles: string[]) {
  if (requiredRoles.length === 0) {
    return true
  }
  const userRoles = getCurrentUserRoles()
  return requiredRoles.some((role) => userRoles.has(role))
}
