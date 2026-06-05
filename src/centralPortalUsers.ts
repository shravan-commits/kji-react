export const CENTRAL_PORTAL_USERS_METHOD =
  'keycloak_integration.utils.get_central_portal_users' as const

export type LocationAssignment = {
  location_code: string
  location_name: string
  location_type: string
  is_primary: number
  assigned_date: string
  assigned_by: string
}

export type LinkedAppRole = {
  app: string
  app_label: string
  role_name: string
  assigned_date: string
  assigned_by: string
}

export type CentralPortalUserRecord = {
  user_code: string
  portal_uid?: string
  full_name: string | null
  email: string | null
  user_type: string
  status: string
  primary_location: string | null
  locations: string[]
  location_assignment?: LocationAssignment[]
  linked_app_roles?: LinkedAppRole[]
  designation: string | null
  level?: string
  last_synced: string
}

export type CentralPortalUsersPayload = {
  message: {
    status: string
    count: number
    users: CentralPortalUserRecord[]
  }
}

export type CentralPortalUserRow = {
  id: string
  name: string
  email: string | null
  type: string
  status: string
  primaryLocation: string
  locationRights: string
}

function formatLocations(locations: string[]) {
  const cleaned = locations.map((l) => l.trim()).filter(Boolean)
  return cleaned.length > 0 ? cleaned.join(', ') : '—'
}

function normalizeListStatus(raw: string) {
  const trimmed = raw.trim()
  return trimmed ? trimmed.toUpperCase() : '—'
}

function derivePrimaryLocation(u: CentralPortalUserRecord): string {
  if (u.location_assignment && u.location_assignment.length > 0) {
    const primary = u.location_assignment.find((l) => l.is_primary === 1)
    const loc = primary ?? u.location_assignment[0]
    return (loc.location_name || loc.location_code || '').trim() || '—'
  }
  return (u.primary_location || '—').trim() || '—'
}

function deriveLocationRights(u: CentralPortalUserRecord): string {
  if (u.location_assignment && u.location_assignment.length > 0) {
    const names = u.location_assignment
      .map((l) => (l.location_name || l.location_code).trim())
      .filter(Boolean)
    return formatLocations(names)
  }
  return formatLocations(u.locations ?? [])
}

export function mapCentralPortalUsersToRows(
  users: CentralPortalUserRecord[],
): CentralPortalUserRow[] {
  return users.map((u) => ({
    id: u.portal_uid || u.user_code,
    name: (u.full_name || u.email || u.user_code).trim() || u.user_code,
    email: u.email || null,
    type: (u.user_type || '—').trim(),
    status: normalizeListStatus(u.status || ''),
    primaryLocation: derivePrimaryLocation(u),
    locationRights: deriveLocationRights(u),
  }))
}

export function resolveCentralPortalUsersCallParams(): Record<string, string> | undefined {
  const status = import.meta.env.VITE_CENTRAL_PORTAL_USERS_STATUS?.trim()
  return status ? { status } : undefined
}
