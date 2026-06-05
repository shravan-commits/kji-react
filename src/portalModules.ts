export const PORTAL_MODULES_METHOD = 'keycloak_integration.api.get_modules' as const
export const PORTAL_MODULES_SYNC_METHOD = 'keycloak_integration.api.sync_modules' as const

export type MenuRecord = {
  name: string
  menu_name: string
  menu_code: string
  is_active: 0 | 1
}

export type ModuleRecord = {
  name: string
  module_name: string
  module_code: string
  is_active: 0 | 1
  last_synced: string
  menu_count: number
  menus: MenuRecord[]
}

export type AppModules = {
  app: string
  app_label: string
  icon_class: string
  logo: string
  module_count: number
  total_menus: number
  modules: ModuleRecord[]
}

export type PortalModulesPayload = {
  message: {
    status: string
    total_modules: number
    total_menus: number
    apps: AppModules[]
  }
}

export type SyncModulesResult = {
  synced_apps: number
  failed_apps: number
  modules_created: number
  modules_updated: number
  menus_created: number
  menus_updated: number
}

export type SyncModulesPayload = {
  message: {
    status: string
    results: SyncModulesResult
  }
}
