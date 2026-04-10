/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FRAPPE_URL?: string
  readonly VITE_FRAPPE_BASE_URL?: string
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
  readonly VITE_KEYCLOAK_REDIRECT_URI?: string
  readonly VITE_KEYCLOAK_POST_LOGOUT_REDIRECT_URI?: string
  readonly VITE_APP_HR_URL?: string
  readonly VITE_APP_WAREHOUSE_URL?: string
  readonly VITE_APP_SALES_URL?: string
  readonly VITE_APP_FINANCE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
