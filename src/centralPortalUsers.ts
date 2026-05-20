export const CENTRAL_PORTAL_USERS_METHOD =
  'keycloak_integration.utils.get_central_portal_users' as const

export type CentralPortalUserRecord = {
  user_code: string
  full_name: string | null
  email: string | null
  user_type: string
  status: string
  primary_location: string | null
  locations: string[]
  designation: string | null
  level: string
  last_synced: string
}

export type CentralPortalUsersPayload = {
  status: string
  count: number
  users: CentralPortalUserRecord[]
}

export type CentralPortalUserRow = {
  id: string
  name: string
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

export function mapCentralPortalUsersToRows(
  users: CentralPortalUserRecord[],
): CentralPortalUserRow[] {
  return users.map((u) => ({
    id: u.user_code,
    name: (u.full_name || u.email || u.user_code).trim() || u.user_code,
    type: (u.user_type || '—').trim(),
    status: normalizeListStatus(u.status || ''),
    primaryLocation: (u.primary_location || '—').trim() || '—',
    locationRights: formatLocations(u.locations ?? []),
  }))
}

export function resolveCentralPortalUsersCallParams(): Record<string, string> | undefined {
  const status = import.meta.env.VITE_CENTRAL_PORTAL_USERS_STATUS?.trim()
  return status ? { status } : undefined
}
