/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to 0/false/no to serve dev over HTTP (Web Crypto only works on http://localhost or http://127.0.0.1 then). */
  readonly VITE_DEV_HTTPS?: string
  /** PEM paths for a custom dev cert (e.g. mkcert); when both exist, they replace the basic-ssl plugin. */
  readonly VITE_DEV_SSL_CERT?: string
  readonly VITE_DEV_SSL_KEY?: string
  /** Comma-separated extra DNS names for the basic-ssl dev certificate. */
  readonly VITE_DEV_SSL_DOMAINS?: string
  readonly VITE_FRAPPE_URL?: string
  readonly VITE_FRAPPE_BASE_URL?: string
  /** When true/1/yes, Frappe API base URL is empty so requests use the portal origin; proxy /api to Frappe. */
  readonly VITE_FRAPPE_SAME_ORIGIN_API?: string
  /** Comma-separated extra browser origins allowed to postMessage this portal on ERP logout. */
  readonly VITE_FRAPPE_LOGOUT_MESSAGE_ORIGINS?: string
  readonly VITE_FRAPPE_TOKEN?: string
  readonly VITE_FRAPPE_TOKEN_TYPE?: string
  readonly VITE_FRAPPE_ENABLE_SOCKET?: string
  readonly VITE_SOCKET_PORT?: string
  readonly VITE_SITE_NAME?: string
  readonly VITE_MAINTENANCE_MODE?: string
  readonly VITE_MAINTENANCE_DURATION?: string
  readonly VITE_MAINTENANCE_UNTIL?: string
  readonly VITE_MAINTENANCE_TYPE?: string
  readonly VITE_MAINTENANCE_SUBTYPE?: string
  readonly VITE_NO_ACCESS_MODE?: string
  readonly VITE_PORTAL_UID?: string
  readonly VITE_PORTAL_DISPLAY_NAME?: string
  readonly VITE_PORTAL_DISPLAY_EMAIL?: string
  readonly VITE_ADMIN_CONTACT_URL?: string
  readonly VITE_KEYCLOAK_URL?: string
  readonly VITE_KEYCLOAK_REALM?: string
  readonly VITE_KEYCLOAK_CLIENT_ID?: string
  readonly VITE_KEYCLOAK_SCOPE?: string
  readonly VITE_KEYCLOAK_REDIRECT_URI?: string
  readonly VITE_KEYCLOAK_POST_LOGOUT_REDIRECT_URI?: string
  /** When true/1/yes, Keycloak session iframe polling detects SSO logout from other tabs (test cookie policies). */
  readonly VITE_KEYCLOAK_CHECK_LOGIN_IFRAME?: string
  /** Seconds between session iframe checks (min 3). */
  readonly VITE_KEYCLOAK_CHECK_LOGIN_IFRAME_INTERVAL_SEC?: string
  /** Periodic forced token refresh in ms (min 15000); 0/unset = off. */
  readonly VITE_KEYCLOAK_SSO_PROBE_INTERVAL_MS?: string
  readonly VITE_APP_HR_URL?: string
  readonly VITE_APP_HR_REQUIRED_ROLES?: string
  readonly VITE_APP_WAREHOUSE_URL?: string
  readonly VITE_APP_WAREHOUSE_REQUIRED_ROLES?: string
  readonly VITE_APP_SALES_URL?: string
  readonly VITE_APP_SALES_REQUIRED_ROLES?: string
  readonly VITE_APP_FINANCE_URL?: string
  readonly VITE_APP_FINANCE_REQUIRED_ROLES?: string
  readonly VITE_USER_LIST_REQUIRED_ROLES?: string
  /** Optional status filter for get_central_portal_users (e.g. Active, Inactive). */
  readonly VITE_CENTRAL_PORTAL_USERS_STATUS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
