export const GET_LOCATIONS_METHOD = 'keycloak_integration.api.get_locations' as const
export const GET_LOCATION_USERS_METHOD = 'keycloak_integration.api.get_location_users' as const
export const SYNC_LOCATIONS_METHOD = 'keycloak_integration.api.sync_locations' as const
export const ASSIGN_USER_LOCATION_METHOD = 'keycloak_integration.api.assign_user_location' as const
export const REMOVE_USER_LOCATION_METHOD = 'keycloak_integration.api.remove_user_location' as const
export const GET_PENDING_LOCATION_REMOVALS_METHOD =
  'keycloak_integration.api.get_pending_location_removals' as const
export const APPROVE_LOCATION_REMOVAL_METHOD =
  'keycloak_integration.api.approve_location_removal' as const

export type LocationRecord = {
  location_code: string
  location_name: string
  region: string
  location_type: string
  hierarchy_level: string
  parent_location: string | null
  status: string
  keycloak_group_id: string | null
  last_synced: string | null
  allocated_users: number
}

export type LocationsPayload = {
  message: {
    locations: LocationRecord[]
    total: number
    limit: number
    offset: number
  }
}

export type LocationUserRecord = {
  user_code: string
  full_name: string
  email: string
  user_type: string
  user_status: string
  is_primary: number
  assigned_date: string
  assigned_by: string
  amendment_notes: string
}

export type LocationUsersPayload = {
  message: {
    location_code: string
    location_name: string
    total: number
    users: LocationUserRecord[]
  }
}

export type SyncLocationsPayload = {
  message: {
    status: string
    kc_synced: number
    errors: number
  }
}

export type PendingRemovalRecord = {
  location_code: string
  location_name: string
  region: string
  location_type: string
  affected_users: number
}

export type PendingLocationRemovalsPayload = {
  message: {
    total: number
    pending_removals: PendingRemovalRecord[]
  }
}

export type ApproveLocationRemovalPayload = {
  message: {
    status: string
    removed_users: number
    errors: number
  }
}
