function truthyEnv(value: string | undefined) {
  const v = value?.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

/** When true, the portal shows the scheduled maintenance screen instead of normal content. */
export function isMaintenanceMode() {
  return truthyEnv(import.meta.env.VITE_MAINTENANCE_MODE)
}

/** Force the no-access screen. Otherwise the screen appears when there are zero active applications. */
export function isNoAccessForced() {
  return truthyEnv(import.meta.env.VITE_NO_ACCESS_MODE)
}

export type MaintenanceInfo = {
  duration: string
  until: string
  type: string
  subtype: string
}

export function getMaintenanceInfo(): MaintenanceInfo {
  return {
    duration:
      import.meta.env.VITE_MAINTENANCE_DURATION?.trim() || '4 Hours',
    until:
      import.meta.env.VITE_MAINTENANCE_UNTIL?.trim() ||
      'Until 11:00 PM IST',
    type: import.meta.env.VITE_MAINTENANCE_TYPE?.trim() || 'Scheduled',
    subtype:
      import.meta.env.VITE_MAINTENANCE_SUBTYPE?.trim() || 'Planned Upgrade',
  }
}

export type NoAccessProfile = {
  portalUid: string
  name: string
  email: string
}

export function getNoAccessProfileDefaults(): NoAccessProfile {
  return {
    portalUid:
      import.meta.env.VITE_PORTAL_UID?.trim() || 'PU-2024-001234',
    name:
      import.meta.env.VITE_PORTAL_DISPLAY_NAME?.trim() || 'John Doe',
    email:
      import.meta.env.VITE_PORTAL_DISPLAY_EMAIL?.trim() ||
      'john.doe@company.com',
  }
}

export function resolveNoAccessProfile(options?: {
  sessionEmail?: string
  sessionName?: string
}): NoAccessProfile {
  const defaults = getNoAccessProfileDefaults()
  const envName = import.meta.env.VITE_PORTAL_DISPLAY_NAME?.trim()
  const envEmail = import.meta.env.VITE_PORTAL_DISPLAY_EMAIL?.trim()
  return {
    portalUid: defaults.portalUid,
    name: envName || options?.sessionName?.trim() || defaults.name,
    email: envEmail || options?.sessionEmail?.trim() || defaults.email,
  }
}

export function getAdminContactUrl() {
  const v = import.meta.env.VITE_ADMIN_CONTACT_URL?.trim()
  return v || 'mailto:administrator@kalyan.local'
}
