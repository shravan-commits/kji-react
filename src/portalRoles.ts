export const PORTAL_ROLES_METHOD = 'keycloak_integration.api.get_roles' as const
export const PORTAL_ROLES_SYNC_METHOD = 'keycloak_integration.api.sync_roles' as const
export const SYNC_FROM_CUBEHR_METHOD = 'keycloak_integration.utils_sync.sync_from_cubehr' as const

export type RoleRecord = {
  name: string
  app: string
  app_label: string
  role_name: string
  role_code: string
  is_active: number
  keycloak_client_id: string
  last_synced: string
}

export type AppRoles = {
  app: string
  app_label: string
  active_count: number
  roles: RoleRecord[]
}

export type PortalRolesPayload = {
  message: {
    status: string
    total: number
    apps: AppRoles[]
  }
}

export type SyncRolesResult = {
  synced: number
  created: number
  updated: number
  failed: number
  apps: {
    app: string
    app_label: string
    created: number
    updated: number
  }[]
}

export type SyncRolesPayload = {
  message: {
    status: string
    results: SyncRolesResult
  }
}

export type SyncFromCubeHRResult = {
  created: number
  updated: number
  failed: number
  skipped: number
}

export type SyncFromCubeHRPayload = {
  message: {
    status: string
    results: SyncFromCubeHRResult
  }
}
