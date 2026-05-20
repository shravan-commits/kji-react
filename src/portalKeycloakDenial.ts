/**
 * Detects Keycloak access denials from the OIDC callback URL. Matches plain-text bodies returned
 * by the Kalyan SPI when Keycloak forwards them into {@code error_description}, and supports an
 * explicit {@code deny} query flag for realm themes or proxies that set it on redirect.
 */
export type PortalKeycloakDenial = 'location' | 'application'

export function parsePortalKeycloakDenial(search: string, hash: string): PortalKeycloakDenial | null {
  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''))
  const deny = (searchParams.get('deny') || hashParams.get('deny') || '').trim().toLowerCase()
  if (deny === 'location') {
    return 'location'
  }
  if (deny === 'application' || deny === 'role') {
    return 'application'
  }
  const description = (searchParams.get('error_description') || hashParams.get('error_description') || '')
    .trim()
    .toLowerCase()
  if (description.includes('location permission denied')) {
    return 'location'
  }
  if (
    description.includes('application access denied') ||
    description.includes('user permission issue')
  ) {
    return 'application'
  }
  return null
}

export function portalKeycloakDenialLead(kind: PortalKeycloakDenial): string {
  if (kind === 'location') {
    return 'Location access was not granted for your account. Your default branch must be included in your allowed locations, and you must meet the application’s location rules. Contact your administrator if this is unexpected.'
  }
  return 'Application access was not granted: your user does not have the required role for this application. Contact your administrator if you need access.'
}

export function portalKeycloakDenialStatus(kind: PortalKeycloakDenial): string {
  return kind === 'location' ? 'Location access not granted' : 'Application access not granted'
}

/** Inline login form copy when the realm rule fails after OIDC (company not in locations). */
export function portalLocationAccessLoginError(): string {
  return 'No location access'
}

/** Inline login error for URL-based Keycloak denials (same style as location token check). */
export function portalKeycloakDenialLoginError(kind: PortalKeycloakDenial): string {
  return kind === 'location' ? portalLocationAccessLoginError() : 'No application access'
}

const PORTAL_DENIAL_QUERY_KEYS = ['deny', 'error', 'error_description', 'error_uri'] as const

/** Removes denial-related OIDC params so the URL does not re-trigger denial UI after cleanup. */
export function stripPortalKeycloakDenialFromSearchAndHash(
  search: string,
  hash: string,
): { search: string; hash: string } {
  const qs = search.startsWith('?') ? search.slice(1) : search
  const sp = new URLSearchParams(qs)
  for (const k of PORTAL_DENIAL_QUERY_KEYS) {
    sp.delete(k)
  }
  const searchOut = sp.toString() ? `?${sp.toString()}` : ''

  const hp = new URLSearchParams(hash.replace(/^#/, ''))
  for (const k of PORTAL_DENIAL_QUERY_KEYS) {
    hp.delete(k)
  }
  const hashOut = hp.toString() ? `#${hp.toString()}` : ''
  return { search: searchOut, hash: hashOut }
}
