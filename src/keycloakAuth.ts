import Keycloak from 'keycloak-js'

type KeycloakInitResult = {
  authenticated: boolean
}

type KeycloakConfig = {
  url: string
  realm: string
  clientId: string
}

function resolveRedirectUri() {
  return import.meta.env.VITE_KEYCLOAK_REDIRECT_URI?.trim() || window.location.origin
}

function resolvePostLogoutRedirectUri() {
  return (
    import.meta.env.VITE_KEYCLOAK_POST_LOGOUT_REDIRECT_URI?.trim() ||
    window.location.origin
  )
}

function getKeycloakConfig(): KeycloakConfig | null {
  const url = import.meta.env.VITE_KEYCLOAK_URL?.trim()
  const realm = import.meta.env.VITE_KEYCLOAK_REALM?.trim()
  const clientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID?.trim()
  if (!url || !realm || !clientId) {
    return null
  }
  return { url, realm, clientId }
}

let keycloak: Keycloak | null = null

let keycloakInitialized = false
let keycloakAuthenticated = false

export async function initializeKeycloak(): Promise<KeycloakInitResult> {
  if (keycloakInitialized) {
    return { authenticated: keycloakAuthenticated }
  }

  const config = getKeycloakConfig()
  if (!config) {
    keycloakInitialized = true
    keycloakAuthenticated = false
    return { authenticated: false }
  }

  keycloak = new Keycloak(config)
  keycloakAuthenticated = await keycloak.init({
    onLoad: 'check-sso',
    pkceMethod: 'S256',
    checkLoginIframe: false,
  })
  keycloakInitialized = true

  return { authenticated: keycloakAuthenticated }
}

export function isKeycloakAuthenticated() {
  return keycloakAuthenticated
}

export async function loginWithKeycloak() {
  if (!keycloak) {
    throw new Error(
      'Keycloak is not configured. Set VITE_KEYCLOAK_URL, VITE_KEYCLOAK_REALM, and VITE_KEYCLOAK_CLIENT_ID.',
    )
  }

  await keycloak.login({
    redirectUri: resolveRedirectUri(),
  })
}

export async function logoutFromKeycloak() {
  if (!keycloak) {
    return
  }

  await keycloak.logout({
    redirectUri: resolvePostLogoutRedirectUri(),
  })
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
