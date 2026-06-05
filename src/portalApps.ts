export const PORTAL_APPLICATIONS_METHOD =
  'keycloak_integration.utils.get_portal_applications' as const

export type PortalApplicationRecord = {
  app_name: string
  app_label: string
  keycloak_client_id: string
  frappe_site_url: string
  auth_url: string
  required_roles: string[]
  icon_class: string
  logo?: string
  app_description?: string
}

export type PortalApplicationsPayload = {
  message: {
    status: string
    apps: PortalApplicationRecord[]
  }
}
