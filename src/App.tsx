import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { FrappeProvider, useFrappeGetCall } from 'frappe-react-sdk'
import {
  getClientIdFromLaunchUrl,
  registerOpenedApplicationSession,
  terminateApplicationSessions,
  type TrackedApplicationWindow,
} from './applicationSessionLogout'
import {
  broadcastCentralPortalLogout,
  installCentralPortalLogoutBroadcastListener,
  PORTAL_LOGOUT_SYNC_KEY,
} from './portalLogoutSync'
import {
  getCurrentClientAccessClaims,
  getCurrentUserCompany,
  getCurrentUserDisplayName,
  getCurrentUserDesignation,
  getCurrentUserLabel,
  getCurrentUserLocations,
  getCurrentUserLocationKeys,
  getKeycloakMixedContentWarning,
  isCentralPortalReachable,
  isKeycloakAuthenticated,
  isKeycloakConfigured,
  isKeycloakUnavailableError,
  forceKeycloakSessionProbeNow,
  KALYAN_PORTAL_TERMINATE_APP_SESSIONS_EVENT,
  loginWithKeycloak,
  logoutFromKeycloak,
  resolvePortalLogoutLandingUrl,
  portalLocationSetsIntersect,
  splitKalyanRoleSpecs,
  subscribeKeycloakSessionLost,
  userSatisfiesAnyKalyanRoleSpec,
} from './keycloakAuth'
import {
  getFrappeApiLikelyBlocker,
  resolveFrappeEnableSocket,
  resolveFrappePostMessageOrigins,
  resolveFrappeProviderUrl,
  resolveFrappeTokenParams,
} from './frappeSdk'
import {
  getMaintenanceInfo,
  isMaintenanceMode,
  isNoAccessForced,
  resolveNoAccessProfile,
} from './portalState'
import {
  parsePortalKeycloakDenial,
  portalKeycloakDenialLead,
  portalKeycloakDenialLoginError,
  stripPortalKeycloakDenialFromSearchAndHash,
} from './portalKeycloakDenial'
import {
  CentralPortalUnavailableView,
  FullMaintenanceView,
  NoAccessView,
} from './portalViews'
import {
  CENTRAL_PORTAL_USERS_METHOD,
  type CentralPortalUsersPayload,
  mapCentralPortalUsersToRows,
  resolveCentralPortalUsersCallParams,
} from './centralPortalUsers'
import './style.css'

/** Dashboard URL after Keycloak sign-in. */
const APPLICATIONS_PATH = '/applications' as const

type MenuKey = 'applications' | 'users'

type ApplicationCard = {
  id: number
  name: string
  usage: string
  status: 'active' | 'inactive'
  description: string
  locations?: string[]
  launchUrl?: string
  /** Mirrors Keycloak client {@code kalyan-required-roles} for portal list filtering (optional). */
  requiredRoles?: string
}

type UserRow = {
  id: string
  name: string
  type: string
  status: string
  primaryLocation: string
  locationRights: string
}

function toOrigin(value: string) {
  try {
    return new URL(value, window.location.href).origin
  } catch {
    return ''
  }
}

function toLocationKey(value: string) {
  const cleaned = value.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!cleaned) {
    return ''
  }
  // Backend and token claims may emit TRISSUR, Thrissur, THRISSUR, or trissur.
  if (cleaned === 'trissur' || cleaned === 'thrissur') {
    return 'thrissur'
  }
  return cleaned
}

// Temporary rollout mapping until per-client locations are sourced from final backend setup.
const TEMP_APPLICATION_LOCATIONS = [
  'Thrissur',
  'Kochi',
  'Delhi',
  'Mumbai',
  'Chennai',
  'Bangalore',
  'Hyderabad',
  'Coimbatore',
] as const

function resolveLocationDisplayName(value: string) {
  const key = toLocationKey(value)
  const match = TEMP_APPLICATION_LOCATIONS.find(
    (locationName) => toLocationKey(locationName) === key,
  )
  return match ?? value.trim()
}

function getApplicationLocations(
  app: ApplicationCard,
  clientAccessClaims: ReturnType<typeof getCurrentClientAccessClaims>,
) {
  const clientId = getClientIdFromLaunchUrl(app.launchUrl)
  const clientLocations = clientId ? clientAccessClaims[clientId]?.locations || [] : []
  const rawLocations = clientLocations.length > 0 ? clientLocations : app.locations || []
  const locations = new Map<string, string>()
  for (const locationName of rawLocations) {
    const key = toLocationKey(locationName)
    if (key && !locations.has(key)) {
      locations.set(key, resolveLocationDisplayName(locationName))
    }
  }
  return [...locations.entries()].map(([key, label]) => ({ key, label }))
}

function matchesApplicationSearch(app: ApplicationCard, search: string) {
  return app.name.toLowerCase().includes(search.trim().toLowerCase())
}

function matchesLocationFilter(locationKey: string, selectedLocation: string) {
  return selectedLocation === 'all' || locationKey === toLocationKey(selectedLocation)
}

/**
 * Mirrors Keycloak {@code ClientApplicationAccessAuthenticator}: if both served locations and
 * required-role specs are non-empty, both must pass; if only one dimension is configured, only that
 * check applies; if neither is configured, the app is shown (Keycloak still allows the client).
 */
function isApplicationEligibleForUser(
  app: ApplicationCard,
  clientAccessClaims: ReturnType<typeof getCurrentClientAccessClaims>,
): boolean {
  const clientId = getClientIdFromLaunchUrl(app.launchUrl)
  const clientLocations = clientId ? clientAccessClaims[clientId]?.locations || [] : []
  const rawLocations = clientLocations.length > 0 ? clientLocations : app.locations || []
  const specs = splitKalyanRoleSpecs(app.requiredRoles)

  const wantsLocation = rawLocations.length > 0
  const wantsRole = specs.length > 0
  if (!wantsLocation && !wantsRole) {
    return true
  }

  const userLocs = getCurrentUserLocations()
  if (wantsLocation) {
    if (userLocs.length === 0) {
      return false
    }
    if (!portalLocationSetsIntersect(userLocs, rawLocations)) {
      return false
    }
  }

  if (wantsRole && !userSatisfiesAnyKalyanRoleSpec(specs)) {
    return false
  }

  return true
}

const applications: ApplicationCard[] = [
  {
    id: 1,
    name: 'HR Application',
    usage: 'HR Usage',
    status: 'active',
    description: 'Advanced predictive modeling and data visualization for supply chain management.',
    locations: [...TEMP_APPLICATION_LOCATIONS],
    launchUrl: import.meta.env.VITE_APP_HR_URL,
    requiredRoles: import.meta.env.VITE_APP_HR_REQUIRED_ROLES,
  },
  {
    id: 2,
    name: 'Warehouse Management',
    usage: 'Warehouse Usage',
    status: 'active',
    description: 'Manage inventory movement, stock health, and warehouse operations from one panel.',
    locations: [...TEMP_APPLICATION_LOCATIONS],
    launchUrl: import.meta.env.VITE_APP_WAREHOUSE_URL,
    requiredRoles: import.meta.env.VITE_APP_WAREHOUSE_REQUIRED_ROLES,
  },
  {
    id: 3,
    name: 'Sales Application',
    usage: 'Sales Usage',
    status: 'active',
    description: 'Track opportunities, customer conversion, and regional sales performance in real time.',
    locations: [...TEMP_APPLICATION_LOCATIONS],
    launchUrl: import.meta.env.VITE_APP_SALES_URL,
    requiredRoles: import.meta.env.VITE_APP_SALES_REQUIRED_ROLES,
  },
  {
    id: 4,
    name: 'Stock Management',
    usage: 'Stock Usage',
    status: 'active',
    description: 'Manage stock levels, transfers, and store-level availability.',
    locations: ['Thrissur', 'Delhi'],
  },
  {
    id: 5,
    name: 'Finance Application',
    usage: 'Finance Usage',
    status: 'active',
    description: 'Control payables, receivables, approvals, and key financial indicators.',
    locations: [...TEMP_APPLICATION_LOCATIONS],
    launchUrl: import.meta.env.VITE_APP_FINANCE_URL,
    requiredRoles: import.meta.env.VITE_APP_FINANCE_REQUIRED_ROLES,
  },
  {
    id: 6,
    name: 'Quality Control',
    usage: 'Quality Usage',
    status: 'active',
    description: 'Monitor quality checkpoints, non-conformance, and release controls.',
    locations: ['Thrissur'],
  },
]

function PortalApp() {
  const navigate = useNavigate()
  const location = useLocation()
  const trackedAppWindowsRef = useRef<TrackedApplicationWindow[]>([])
  const wasAuthenticatedRef = useRef(false)
  const [authRevision, setAuthRevision] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [portalUnavailable, setPortalUnavailable] = useState(false)
  const [activeMenu, setActiveMenu] = useState<MenuKey>('applications')
  /** Applications search only — do not reuse for Users or app names filter out every user row. */
  const [applicationSearch, setApplicationSearch] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [selectedLocation, setSelectedLocation] = useState('all')
  const hasUserTouchedLocationFilterRef = useRef(false)
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false)
  const locationDropdownRef = useRef<HTMLDivElement>(null)

  /** Navigates tracked app tabs to Frappe sso_logout and fans out to all configured app origins. */
  const terminateLinkedApplicationSessions = useCallback(() => {
    const trackedApps = trackedAppWindowsRef.current
    terminateApplicationSessions(trackedApps)
    trackedAppWindowsRef.current = trackedApps.filter((entry) => !entry.window.closed)
  }, [])

  const keycloakAuthError = (() => {
    const searchParams = new URLSearchParams(location.search)
    const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''))
    const error =
      searchParams.get('error') || hashParams.get('error') || ''
    const description =
      searchParams.get('error_description') ||
      hashParams.get('error_description') ||
      ''
    return {
      error: error.trim().toLowerCase(),
      description: description.trim().toLowerCase(),
    }
  })()
  const isAuthenticated = isKeycloakAuthenticated()
  const isClientUnavailableError =
    keycloakAuthError.error.includes('client') ||
    keycloakAuthError.error.includes('unauthorized_client') ||
    keycloakAuthError.description.includes('client') ||
    keycloakAuthError.description.includes('disabled')
  const knownApplicationOrigins = (() => {
    const out = new Set<string>()
    for (const app of applications) {
      if (app.launchUrl) {
        const appOrigin = toOrigin(app.launchUrl)
        if (appOrigin) {
          out.add(appOrigin)
        }
      }
    }
    for (const origin of resolveFrappePostMessageOrigins()) {
      const normalized = toOrigin(origin)
      if (normalized) {
        out.add(normalized)
      }
    }
    return out
  })()

  const userListRoleSpecs = splitKalyanRoleSpecs(import.meta.env.VITE_USER_LIST_REQUIRED_ROLES)
  const canViewUsers = userSatisfiesAnyKalyanRoleSpec(userListRoleSpecs)
  const userListSwrKey = activeMenu === 'users' && canViewUsers ? undefined : null
  const centralPortalUsersParams = resolveCentralPortalUsersCallParams()
  const {
    data: centralPortalUsersPayload,
    isLoading: usersListLoading,
    error: usersListError,
  } = useFrappeGetCall<CentralPortalUsersPayload>(
    CENTRAL_PORTAL_USERS_METHOD,
    centralPortalUsersParams,
    userListSwrKey,
    {
      revalidateOnFocus: true,
      shouldRetryOnError: false,
      refreshInterval: activeMenu === 'users' ? 5000 : 0,
    },
  )

  const users: UserRow[] = mapCentralPortalUsersToRows(
    centralPortalUsersPayload?.users ?? [],
  )

  useEffect(() => {
    const onTerminate = () => {
      terminateLinkedApplicationSessions()
    }
    window.addEventListener(KALYAN_PORTAL_TERMINATE_APP_SESSIONS_EVENT, onTerminate)
    return () => {
      window.removeEventListener(KALYAN_PORTAL_TERMINATE_APP_SESSIONS_EVENT, onTerminate)
    }
  }, [terminateLinkedApplicationSessions])

  useEffect(() => {
    return subscribeKeycloakSessionLost(() => {
      trackedAppWindowsRef.current = []
      setActiveMenu('applications')
      setAuthRevision((n) => n + 1)
      try {
        const landing = new URL(resolvePortalLogoutLandingUrl())
        navigate(
          { pathname: landing.pathname, search: landing.search, hash: '' },
          { replace: true },
        )
      } catch {
        navigate({ pathname: APPLICATIONS_PATH, search: '?no_access=1', hash: '' }, { replace: true })
      }
    })
  }, [navigate])

  useLayoutEffect(() => {
    if (!isAuthenticated) {
      return
    }
    if (parsePortalKeycloakDenial(location.search, location.hash) === null) {
      return
    }
    const { search, hash } = stripPortalKeycloakDenialFromSearchAndHash(
      location.search,
      location.hash,
    )
    const path =
      location.pathname === '/' || location.pathname === ''
        ? APPLICATIONS_PATH
        : location.pathname
    navigate({ pathname: path, search, hash }, { replace: true })
  }, [isAuthenticated, location.pathname, location.search, location.hash, navigate])

  useLayoutEffect(() => {
    if (isAuthenticated) {
      return
    }
    const kind = parsePortalKeycloakDenial(location.search, location.hash)
    if (kind === null) {
      return
    }
    setError(portalKeycloakDenialLoginError(kind))
    navigate({ pathname: '/', search: '', hash: '' }, { replace: true })
  }, [isAuthenticated, location.search, location.hash, navigate])

  useEffect(() => {
    if (!locationDropdownOpen) {
      return
    }
    const onMouseDown = (event: MouseEvent) => {
      if (
        locationDropdownRef.current &&
        !locationDropdownRef.current.contains(event.target as Node)
      ) {
        setLocationDropdownOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLocationDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [locationDropdownOpen])

  useEffect(() => {
    const onCentralPortalLogout = () => {
      // Another portal tab or Keycloak ended the SSO session — end ERP tabs from this tab too.
      terminateLinkedApplicationSessions()
      if (!isKeycloakAuthenticated()) {
        return
      }
      void logoutFromKeycloak().catch(() => {
        setAuthRevision((n) => n + 1)
        setActiveMenu('applications')
        try {
          const landing = new URL(resolvePortalLogoutLandingUrl())
          navigate(
            { pathname: landing.pathname, search: landing.search, hash: '' },
            { replace: true },
          )
        } catch {
          navigate('/', { replace: true })
        }
      })
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== PORTAL_LOGOUT_SYNC_KEY || !event.newValue) {
        return
      }
      onCentralPortalLogout()
    }
    window.addEventListener('storage', onStorage)
    const unsubscribeBroadcast =
      installCentralPortalLogoutBroadcastListener(onCentralPortalLogout)
    return () => {
      window.removeEventListener('storage', onStorage)
      unsubscribeBroadcast()
    }
  }, [navigate, terminateLinkedApplicationSessions])

  useEffect(() => {
    if (isAuthenticated) {
      return
    }
    const referrer = document.referrer
    if (!referrer) {
      return
    }
    const referrerOrigin = toOrigin(referrer)
    if (!referrerOrigin || !knownApplicationOrigins.has(referrerOrigin)) {
      return
    }
    try {
      localStorage.setItem(PORTAL_LOGOUT_SYNC_KEY, String(Date.now()))
    } catch {
      // Ignore storage write failures; this is a best-effort cross-tab sync signal.
    }
  }, [isAuthenticated, knownApplicationOrigins])

  useEffect(() => {
    const wasAuthenticated = wasAuthenticatedRef.current
    if (isAuthenticated) {
      wasAuthenticatedRef.current = true
      return
    }
    if (!wasAuthenticated) {
      return
    }
    wasAuthenticatedRef.current = false
    try {
      localStorage.setItem(PORTAL_LOGOUT_SYNC_KEY, String(Date.now()))
    } catch {
      // Ignore storage write failures (private mode / quota), local logout still works.
    }
  }, [isAuthenticated])

  // While an ERP window opened from here is still open (or just closed), force a Keycloak refresh so
  // the main tab notices sso_logout / global SSO end without waiting for focus or the global probe interval.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!isKeycloakAuthenticated()) {
        trackedAppWindowsRef.current = []
        return
      }
      const list = trackedAppWindowsRef.current
      if (list.length === 0) {
        return
      }
      const stillOpen: TrackedApplicationWindow[] = []
      let anyClosed = false
      for (const entry of list) {
        if (entry.window.closed) {
          anyClosed = true
        } else {
          stillOpen.push(entry)
        }
      }
      if (anyClosed) {
        trackedAppWindowsRef.current = stillOpen
      }
      const hasOpenAuxiliary = stillOpen.length > 0
      if (anyClosed || hasOpenAuxiliary) {
        void forceKeycloakSessionProbeNow()
      }
    }, 4000)
    return () => window.clearInterval(id)
  }, [authRevision])

  useEffect(() => {
    if (!isKeycloakAuthenticated()) {
      return
    }
    if (location.pathname !== APPLICATIONS_PATH) {
      navigate(APPLICATIONS_PATH, { replace: true })
    }
  }, [location.pathname, navigate, authRevision])

  useEffect(() => {
    if (!isKeycloakConfigured() || isKeycloakAuthenticated()) {
      return
    }
    if (isClientUnavailableError) {
      setPortalUnavailable(true)
    }
  }, [authRevision, isClientUnavailableError])

  useEffect(() => {
    if (!isAuthenticated) {
      return
    }
    // Pull latest token claims from Keycloak as soon as the dashboard loads.
    void forceKeycloakSessionProbeNow().finally(() => {
      setAuthRevision((n) => n + 1)
    })
  }, [isAuthenticated])

  const handleLoginWithKeycloak = async () => {
    setError('')
    setPortalUnavailable(false)
    setLoading(true)
    try {
      const reachable = await isCentralPortalReachable()
      if (!reachable) {
        setPortalUnavailable(true)
        setLoading(false)
        return
      }
      await loginWithKeycloak()
    } catch (e) {
      if (isKeycloakUnavailableError(e)) {
        setPortalUnavailable(true)
      }
      const message = e instanceof Error ? e.message : 'Could not open Keycloak login.'
      setError(message)
      setLoading(false)
    }
  }

  const handleRetryPortalConnection = async () => {
    setError('')
    setLoading(true)
    const reachable = await isCentralPortalReachable()
    setPortalUnavailable(!reachable)
    if (reachable) {
      const { search, hash } = stripPortalKeycloakDenialFromSearchAndHash(
        location.search,
        location.hash,
      )
      navigate({ pathname: location.pathname || '/', search, hash }, { replace: true })
    }
    setLoading(false)
  }

  const clientAccessClaims = getCurrentClientAccessClaims()

  const maintenance = isMaintenanceMode()
  const eligibleActiveApplications = applications.filter(
    (app) => app.status === 'active' && isApplicationEligibleForUser(app, clientAccessClaims),
  )
  const noAccessFromQuery = (() => {
    const value = new URLSearchParams(location.search).get('no_access')?.toLowerCase()
    return value === '1' || value === 'true' || value === 'yes'
  })()
  const noAppsForUser =
    !maintenance &&
    !isNoAccessForced() &&
    !noAccessFromQuery &&
    eligibleActiveApplications.length === 0
  const noAccess =
    !maintenance &&
    (isNoAccessForced() || noAccessFromQuery || eligibleActiveApplications.length === 0)

  useEffect(() => {
    if (!noAccessFromQuery) {
      return
    }
    // Central / Keycloak logout landing URL — end ERP tabs and sync other portal tabs.
    terminateLinkedApplicationSessions()
    try {
      localStorage.setItem(PORTAL_LOGOUT_SYNC_KEY, String(Date.now()))
    } catch {
      // Ignore storage failures; direct-tab logout below still runs when authenticated.
    }
    if (!isAuthenticated) {
      return
    }
    // When a linked app reports sign-out/no_access, force central portal sign-out too.
    void logoutFromKeycloak().catch(() => {
      setAuthRevision((n) => n + 1)
      setActiveMenu('applications')
      navigate('/', { replace: true })
    })
  }, [isAuthenticated, navigate, noAccessFromQuery, terminateLinkedApplicationSessions])

  const sessionEmail = getCurrentUserLabel()
  const displayName = getCurrentUserDisplayName() || 'User'
  const designation = getCurrentUserDesignation()
  const locationOptionMap = new Map<string, string>()
  for (const locationName of getCurrentUserLocations()) {
    const key = toLocationKey(locationName)
    if (key && !locationOptionMap.has(key)) {
      locationOptionMap.set(key, resolveLocationDisplayName(locationName))
    }
  }
  const locationOptions = [...locationOptionMap.values()]
  const locationFilterItems: { value: string; label: string }[] = [
    { value: 'all', label: 'All Locations' },
    ...locationOptions.map((name) => ({ value: name, label: name })),
  ]
  const defaultCompanyLocation = resolveLocationDisplayName(getCurrentUserCompany())
  const defaultCompanyFilterValue =
    locationFilterItems.find(
      (item) => toLocationKey(item.value) === toLocationKey(defaultCompanyLocation),
    )?.value ?? ''

  useEffect(() => {
    if (hasUserTouchedLocationFilterRef.current) {
      return
    }
    if (selectedLocation !== 'all') {
      return
    }
    if (!defaultCompanyFilterValue) {
      return
    }
    setSelectedLocation(defaultCompanyFilterValue)
  }, [defaultCompanyFilterValue, selectedLocation])

  useEffect(() => {
    const selectedStillAvailable = locationFilterItems.some(
      (item) => toLocationKey(item.value) === toLocationKey(selectedLocation),
    )
    if (selectedStillAvailable) {
      return
    }
    if (defaultCompanyFilterValue) {
      setSelectedLocation(defaultCompanyFilterValue)
      return
    }
    setSelectedLocation('all')
  }, [defaultCompanyFilterValue, locationFilterItems, selectedLocation])

  const selectedLocationLabel =
    locationFilterItems.find(
      (item) => toLocationKey(item.value) === toLocationKey(selectedLocation),
    )?.label ?? 'All Locations'
  const noAccessProfile = resolveNoAccessProfile({
    sessionEmail,
    sessionName: displayName,
  })
  const maintenanceInfo = getMaintenanceInfo()

  const userLocationKeys = getCurrentUserLocationKeys()
  const locationEligibleApplicationCards = applications.flatMap((app) => {
    if (!isApplicationEligibleForUser(app, clientAccessClaims)) {
      return []
    }
    if (!matchesApplicationSearch(app, applicationSearch)) {
      return []
    }
    const visibleLocations = getApplicationLocations(app, clientAccessClaims).filter(
      (entry) =>
        userLocationKeys.has(entry.key) &&
        matchesLocationFilter(entry.key, selectedLocation),
    )
    return visibleLocations.map((entry) => ({
      app,
      locationKey: entry.key,
      locationLabel: entry.label,
    }))
  })
  const openApplication = (
    app: ApplicationCard,
    locationKey: string,
    _locationLabel: string,
  ) => {
    if (!app.launchUrl || app.status !== 'active') {
      return
    }
    if (!isApplicationEligibleForUser(app, getCurrentClientAccessClaims())) {
      return
    }
    if (!getCurrentUserLocationKeys().has(locationKey)) {
      return
    }
    const targetName = `kalyan-erp-${app.id}-${locationKey}-${Date.now()}`
    registerOpenedApplicationSession(app.launchUrl)
    // No noopener/noreferrer so ERP tabs can postMessage this portal on their logout.
    const child = window.open(app.launchUrl, targetName)
    if (child) {
      trackedAppWindowsRef.current.push({
        window: child,
        launchUrl: app.launchUrl,
      })
    }
  }

  const userSearchNeedle = userSearch.trim().toLowerCase()
  const filteredUsers = users.filter((item) => {
    if (!userSearchNeedle) {
      return true
    }
    return (
      item.name.toLowerCase().includes(userSearchNeedle) ||
      item.id.toLowerCase().includes(userSearchNeedle)
    )
  })

  const frappeUserListErrorLead = (() => {
    const hint = getFrappeApiLikelyBlocker()
    const base =
      'Keycloak role checks passed, but loading central portal users failed. Typical causes: calling Frappe on another origin without CORS/cookies, or HTTPS portal vs HTTP Frappe. Try VITE_FRAPPE_SAME_ORIGIN_API=true so requests go to /api on this host (Vite or nginx proxies to VITE_FRAPPE_BASE_URL), or configure Frappe CORS + HTTPS, or use a server-side token.'
    return hint ? `${base} ${hint}` : base
  })()

  const handlePortalLogout = async () => {
    setError('')
    broadcastCentralPortalLogout()
    // Same user gesture as Keycloak logout — end ERP/Keycloak app tabs immediately (event also fires inside logoutFromKeycloak).
    terminateLinkedApplicationSessions()
    try {
      await logoutFromKeycloak()
    } catch {
      // Ignore Keycloak redirect errors and continue local cleanup.
    }
    trackedAppWindowsRef.current = []
    setAuthRevision((n) => n + 1)
    setActiveMenu('applications')
  }

  const handleBackToApplicationsDashboard = () => {
    setActiveMenu('applications')
    navigate({ pathname: APPLICATIONS_PATH, search: '', hash: '' }, { replace: true })
  }

  if (isAuthenticated) {
    return (
      <main className="portal-layout">
        <aside className="sidebar">
          <div>
            <div className="brand-box">
              <img src="/KalyanLogo/KalyanLogo.svg" alt="Kalyan logo" />
            </div>
            <nav className="menu-list">
              <button
                className={activeMenu === 'applications' ? 'active' : ''}
                onClick={() => setActiveMenu('applications')}
              >
                <img src="/ApplicationIcon.svg" alt="" className="menu-icon" />
                My Applications
              </button>
              <button
                className={activeMenu === 'users' ? 'active' : ''}
                onClick={() => setActiveMenu('users')}
              >
                <img src="/UserIcon.svg" alt="" className="menu-icon" />
                Users
              </button>
            </nav>
          </div>
          <div className="sidebar-bottom">
            <button className="ghost-btn">
              <svg viewBox="0 0 24 24" className="menu-icon" aria-hidden="true">
                <path
                  d="M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7zm9 3.5l-2.02-.58a7.88 7.88 0 0 0-.57-1.36l1.1-1.79l-1.77-1.77l-1.79 1.1c-.43-.24-.88-.43-1.36-.57L14 3h-4l-.58 2.02c-.48.14-.93.33-1.36.57l-1.79-1.1L4.5 6.27l1.1 1.79c-.24.43-.43.88-.57 1.36L3 10v4l2.02.58c.14.48.33.93.57 1.36l-1.1 1.79l1.77 1.77l1.79-1.1c.43.24.88.43 1.36.57L10 21h4l.58-2.02c.48-.14.93-.33 1.36-.57l1.79 1.1l1.77-1.77l-1.1-1.79c.24-.43.43-.88.57-1.36L21 14v-4z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Settings
            </button>
            <button className="ghost-btn logout" onClick={handlePortalLogout}>
              <svg viewBox="0 0 24 24" className="menu-icon" aria-hidden="true">
                <path
                  d="M15 7V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M10 12h11m-3-3l3 3l-3 3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Logout
            </button>
          </div>
        </aside>

        <section className="content-shell">
          <header className="topbar">
            <p>
              Dashboard /{' '}
              {maintenance
                ? 'Maintenance'
                : activeMenu === 'applications'
                  ? 'Applications'
                  : 'Users'}
            </p>
            <div className="topbar-right">
              <div className="profile-mini">
                <img src="/UserIcon.svg" alt="Profile" className="profile-avatar" />
                <div className="profile-details">
                  <strong>{displayName}</strong>
                  <span>{sessionEmail || ''}</span>
                  {designation ? <span>{designation}</span> : null}
                </div>
              </div>
            </div>
          </header>

          {maintenance ? (
            <FullMaintenanceView
              info={maintenanceInfo}
              onBackToPortal={handleBackToApplicationsDashboard}
            />
          ) : null}

          {!maintenance && activeMenu === 'applications' && noAccess ? (
            <NoAccessView
              profile={noAccessProfile}
              title={undefined}
              lead={
                noAccessFromQuery
                  ? 'We could not complete sign-in to the selected application.'
                  : noAppsForUser
                    ? 'No integrated applications match your allowed locations and roles for this portal. Sign-in to each app is enforced in Keycloak; contact your administrator if you need access.'
                    : undefined
              }
              statusLabel={
                noAccessFromQuery
                  ? 'Application Access Failed'
                  : noAppsForUser
                    ? 'Application access not granted'
                    : undefined
              }
              showBackToPortal={!noAccessFromQuery}
              onBackToPortal={handleBackToApplicationsDashboard}
              onLogout={handlePortalLogout}
            />
          ) : null}

          {!maintenance && activeMenu === 'applications' && !noAccess ? (
            <section className="view-wrap">
              <h1>Integrated Applications</h1>
              <p className="view-subtitle">
                Curate and manage your enterprise application stack. Monitor performance,
                lifecycle status, and access controls from a centralized interface.
              </p>
              <div className="table-toolbar">
                <h2>
                  All Applications <span>({locationEligibleApplicationCards.length})</span>
                </h2>
                <div className="toolbar-filters">
                  <div className="search-pill">
                    <input
                      className="search-pill-input"
                      type="search"
                      placeholder="Search application"
                      value={applicationSearch}
                      onChange={(event) => setApplicationSearch(event.target.value)}
                      aria-label="Search applications"
                    />
                    <button
                      type="button"
                      className="search-pill-action"
                      aria-label="Search"
                    >
                      <img src="/searchButton.svg" width={30} height={30} alt="" />
                    </button>
                  </div>
                  <div
                    className={`loc-dropdown ${locationDropdownOpen ? 'is-open' : ''}`}
                    ref={locationDropdownRef}
                  >
                    <button
                      type="button"
                      className="loc-dropdown-trigger sort-pill"
                      id="location-filter-trigger"
                      aria-haspopup="listbox"
                      aria-expanded={locationDropdownOpen}
                      aria-controls="location-filter-listbox"
                      aria-label={`Filter by location. ${selectedLocationLabel}`}
                      onClick={() => setLocationDropdownOpen((open) => !open)}
                    >
                      <img
                        src="/sortButton.svg"
                        className="sort-pill-icon"
                        width={30}
                        height={30}
                        alt=""
                      />
                      <span className="sort-pill-label">Location</span>
                      <span className="loc-dropdown-value">{selectedLocationLabel}</span>
                      <span className="sort-pill-chevron loc-dropdown-chevron" aria-hidden>
                        ▼
                      </span>
                    </button>
                    {locationDropdownOpen ? (
                      <div
                        className="loc-dropdown-panel"
                        id="location-filter-listbox"
                        role="listbox"
                        aria-labelledby="location-filter-trigger"
                      >
                        <div className="loc-dropdown-panel-glow" aria-hidden />
                        <div className="loc-dropdown-list" role="presentation">
                          {locationFilterItems.map((item, index) => {
                            const selected =
                              toLocationKey(item.value) === toLocationKey(selectedLocation)
                            return (
                              <div
                                key={item.value === 'all' ? 'all' : item.value}
                                className="loc-dropdown-item-wrap"
                                role="presentation"
                                style={{ animationDelay: `${40 + index * 48}ms` }}
                              >
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={selected}
                                  className={`loc-dropdown-item ${selected ? 'is-selected' : ''}`}
                                  onClick={() => {
                                    hasUserTouchedLocationFilterRef.current = true
                                    setSelectedLocation(item.value)
                                    setLocationDropdownOpen(false)
                                  }}
                                >
                                  <span className="loc-dropdown-item-check" aria-hidden>
                                    ✓
                                  </span>
                                  <span className="loc-dropdown-item-label">{item.label}</span>
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="apps-grid">
                {locationEligibleApplicationCards.map(({ app, locationKey, locationLabel }) => {
                  const appClientId = getClientIdFromLaunchUrl(app.launchUrl)
                  const cardName = appClientId || app.name
                  const buttonClassName =
                    app.status !== 'active' ? 'app-open-btn is-disabled' : 'app-open-btn can-open'
                  return (
                  <article key={`${app.id}-${locationKey}`} className="app-card">
                    <div className="app-head">
                      <div className="app-title-wrap">
                        <div className="app-icon">
                          <svg viewBox="0 0 20 20" aria-hidden="true">
                            <rect x="3" y="4" width="14" height="12" rx="2" />
                            <line x1="3" y1="8" x2="17" y2="8" />
                          </svg>
                        </div>
                        <div>
                          <h3>{cardName}</h3>
                          <small>{app.usage}</small>
                        </div>
                      </div>
                      <span className={`status-pill ${app.status}`}>
                        <i />
                        {app.status.toUpperCase()}
                      </span>
                    </div>
                    <p>{app.description}</p>
                    <div className="app-locations">
                      <span className="app-locations-label">Location</span>
                      <span className="app-locations-list">{locationLabel}</span>
                    </div>
                    <div className="app-footer">
                      <button
                        className={buttonClassName}
                        type="button"
                        aria-label={`Open ${cardName}`}
                        disabled={app.status !== 'active'}
                        onClick={() => openApplication(app, locationKey, locationLabel)}
                      >
                        <span className="app-open-arrow" aria-hidden>
                          →
                        </span>
                      </button>
                    </div>
                  </article>
                  )
                })}
              </div>
            </section>
          ) : null}

          {!maintenance && activeMenu === 'users' ? (
            !canViewUsers ? (
              <NoAccessView
                profile={noAccessProfile}
                title="Access not granted"
                lead={portalKeycloakDenialLead('location')}
                statusLabel="Location access not granted"
                showBackToPortal
                onBackToPortal={handleBackToApplicationsDashboard}
                onLogout={handlePortalLogout}
              />
            ) : usersListError ? (
              <NoAccessView
                profile={noAccessProfile}
                title="Could not load users"
                lead={frappeUserListErrorLead}
                statusLabel="ERP / Frappe request failed"
                showBackToPortal={!noAccess}
                onBackToPortal={handleBackToApplicationsDashboard}
                onLogout={handlePortalLogout}
              />
            ) : (
              <section className="view-wrap">
                <h1>Our Users</h1>
                <p className="view-subtitle">
                  Access detailed information and manage user records seamlessly.
                </p>
                <div className="table-toolbar">
                  <h2>
                    User List <span>({filteredUsers.length})</span>
                  </h2>
                  <div className="toolbar-filters">
                    <div className="search-pill">
                      <input
                        className="search-pill-input"
                        type="search"
                        placeholder="Search user"
                        value={userSearch}
                        onChange={(event) => setUserSearch(event.target.value)}
                        aria-label="Search users"
                      />
                      <button
                        type="button"
                        className="search-pill-action"
                        aria-label="Search"
                      >
                        <img src="/searchButton.svg" width={30} height={30} alt="" />
                      </button>
                    </div>
                    <button type="button" className="sort-pill">
                      <img
                        src="/sortButton.svg"
                        className="sort-pill-icon"
                        width={30}
                        height={30}
                        alt=""
                      />
                      <span className="sort-pill-label">Sort by</span>
                      <span className="sort-pill-chevron" aria-hidden>
                        ▼
                      </span>
                    </button>
                  </div>
                </div>
                <div className="table-card user-list-card">
                  <table className="user-list-table">
                    <thead>
                      <tr>
                        <th>Portal UID</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Primary Location</th>
                        <th>Location Rights</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersListLoading ? (
                        <tr>
                          <td colSpan={7} className="user-list-status">
                            Loading users…
                          </td>
                        </tr>
                      ) : null}
                      {!usersListLoading && !usersListError
                        ? filteredUsers.map((item) => (
                            <tr key={item.id}>
                              <td>{item.id}</td>
                              <td>{item.name}</td>
                              <td>
                                <span className="pill muted">{item.type}</span>
                              </td>
                              <td>
                                <span
                                  className={`pill ${item.status === 'ACTIVE' ? 'green' : 'muted'}`}
                                >
                                  {item.status}
                                </span>
                              </td>
                              <td>{item.primaryLocation}</td>
                              <td>{item.locationRights}</td>
                              <td>
                                <button type="button" className="user-row-action">
                                  View
                                </button>
                              </td>
                            </tr>
                          ))
                        : null}
                      {!usersListLoading && !usersListError && filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="user-list-status">
                            {users.length === 0
                              ? 'ERP returned no users for this account (check Frappe permissions on User, or raise the list limit).'
                              : userSearchNeedle
                                ? 'No users match your search. Clear the search box or try Portal UID / name.'
                                : 'No users found.'}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          ) : null}
        </section>
      </main>
    )
  }

  if (!isKeycloakConfigured()) {
    return (
      <main className="login-page">
        <section className="form-panel">
          <div className="login-card">
            <h2>Configuration required</h2>
            <p className="subtitle">
              Keycloak is not configured for this deployment. Set{' '}
              <strong>VITE_KEYCLOAK_URL</strong>, <strong>VITE_KEYCLOAK_REALM</strong>, and{' '}
              <strong>VITE_KEYCLOAK_CLIENT_ID</strong>, then rebuild the app and reload.
            </p>
          </div>
        </section>
      </main>
    )
  }

  if (!isAuthenticated) {
    if (portalUnavailable) {
      return (
        <main className="portal-unavailable-shell">
          <CentralPortalUnavailableView
            info={maintenanceInfo}
            onRetry={handleRetryPortalConnection}
          />
          {isClientUnavailableError ? (
            <p className="subtitle">Keycloak client is unavailable or disabled.</p>
          ) : null}
          {loading ? <p className="subtitle">Checking portal status...</p> : null}
        </main>
      )
    }

    return (
      <main className="login-page">
        <section className="branding-panel">
          <div className="branding-content">
            <img
              src="/KalyanLogo/KalyanLogo.svg"
              alt="Kalyan logo"
              className="kalyan-logo"
            />
            <h1>UNIFIED ACCESS</h1>
            <p>
              Continue to Keycloak to sign in. After a successful login you will return to
              this portal at <strong>/applications</strong>.
            </p>
          </div>
        </section>

        <section className="form-panel">
          <div className="login-card">
            <h2>KEYCLOAK LOGIN</h2>
            <p className="subtitle">
              Use your organization&apos;s Keycloak page to enter your credentials.
            </p>

            {error ? <p className="error-text">{error}</p> : null}
            {getKeycloakMixedContentWarning() ? (
              <p className="error-text">{getKeycloakMixedContentWarning()}</p>
            ) : null}

            <button
              className="login-btn"
              type="button"
              disabled={loading}
              onClick={() => void handleLoginWithKeycloak()}
            >
              {loading ? 'Redirecting...' : 'Login with Employee Code'}
            </button>
          </div>
        </section>
      </main>
    )
  }

  return null
}

function App() {
  return (
    <FrappeProvider
      url={resolveFrappeProviderUrl()}
      tokenParams={resolveFrappeTokenParams()}
      swrConfig={{ errorRetryCount: 2 }}
      socketPort={import.meta.env.VITE_SOCKET_PORT}
      siteName={import.meta.env.VITE_SITE_NAME}
      enableSocket={resolveFrappeEnableSocket()}
    >
      <Routes>
        <Route path="/application" element={<Navigate to={APPLICATIONS_PATH} replace />} />
        <Route path={APPLICATIONS_PATH} element={<PortalApp />} />
        <Route path="/*" element={<PortalApp />} />
      </Routes>
    </FrappeProvider>
  )
}

export default App
