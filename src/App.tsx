import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { FrappeProvider, useFrappeGetDocList } from 'frappe-react-sdk'
import {
  getCurrentUserDisplayName,
  getCurrentUserLabel,
  hasCurrentUserAnyRole,
  isCentralPortalReachable,
  isKeycloakAuthenticated,
  isKeycloakConfigured,
  isKeycloakUnavailableError,
  forceKeycloakSessionProbeNow,
  loginWithKeycloak,
  logoutFromKeycloak,
  resolveRequiredRoles,
  subscribeKeycloakSessionLost,
} from './keycloakAuth'
import {
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
  CentralPortalUnavailableView,
  FullMaintenanceView,
  NoAccessView,
} from './portalViews'
import './style.css'

/** Dashboard URL after Keycloak sign-in. */
const APPLICATIONS_PATH = '/applications' as const
const PORTAL_LOGOUT_SYNC_KEY = 'kalyan-portal:logout-sync' as const

type MenuKey = 'applications' | 'users'

type ApplicationCard = {
  id: number
  name: string
  usage: string
  status: 'active' | 'inactive'
  description: string
  launchUrl?: string
  requiredRoles?: string[]
}

type UserRow = {
  id: string
  name: string
  type: string
  status: 'ACTIVE' | 'INACTIVE'
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

type TrackedApplicationWindow = {
  window: Window
  logoutUrl: string | null
}

const applications: ApplicationCard[] = [
  {
    id: 1,
    name: 'HR Application',
    usage: 'HR Usage',
    status: 'active',
    description: 'Advanced predictive modeling and data visualization for supply chain management.',
    launchUrl: import.meta.env.VITE_APP_HR_URL,
    requiredRoles: resolveRequiredRoles(import.meta.env.VITE_APP_HR_REQUIRED_ROLES),
  },
  {
    id: 2,
    name: 'Warehouse Management',
    usage: 'Warehouse Usage',
    status: 'active',
    description: 'Manage inventory movement, stock health, and warehouse operations from one panel.',
    launchUrl: import.meta.env.VITE_APP_WAREHOUSE_URL,
    requiredRoles: resolveRequiredRoles(import.meta.env.VITE_APP_WAREHOUSE_REQUIRED_ROLES),
  },
  {
    id: 3,
    name: 'Sales Application',
    usage: 'Sales Usage',
    status: 'active',
    description: 'Track opportunities, customer conversion, and regional sales performance in real time.',
    launchUrl: import.meta.env.VITE_APP_SALES_URL,
    requiredRoles: resolveRequiredRoles(import.meta.env.VITE_APP_SALES_REQUIRED_ROLES),
  },
  {
    id: 4,
    name: 'Stock Management',
    usage: 'Stock Usage',
    status: 'inactive',
    description: 'This application is currently inactive and not available for use.',
  },
  {
    id: 5,
    name: 'Finance Application',
    usage: 'Finance Usage',
    status: 'active',
    description: 'Control payables, receivables, approvals, and key financial indicators.',
    launchUrl: import.meta.env.VITE_APP_FINANCE_URL,
    requiredRoles: resolveRequiredRoles(import.meta.env.VITE_APP_FINANCE_REQUIRED_ROLES),
  },
  {
    id: 6,
    name: 'Quality Control',
    usage: 'Quality Usage',
    status: 'inactive',
    description: 'This application is currently inactive and not available for use.',
  },
]

const usersRequiredRoles = resolveRequiredRoles(
  import.meta.env.VITE_USER_LIST_REQUIRED_ROLES || 'System Manager',
)

type FrappeUserDoc = {
  name: string
  full_name?: string | null
  enabled?: number | boolean | null
  user_type?: string | null
}

function PortalApp() {
  const navigate = useNavigate()
  const location = useLocation()
  const trackedAppWindowsRef = useRef<TrackedApplicationWindow[]>([])
  const wasAuthenticatedRef = useRef(false)
  const [authRevision, setAuthRevision] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [portalUnavailable, setPortalUnavailable] = useState(false)
  const [appAccessDenied, setAppAccessDenied] = useState<string | null>(null)
  const [activeMenu, setActiveMenu] = useState<MenuKey>('applications')
  const [search, setSearch] = useState('')
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

  const canViewUserList = hasCurrentUserAnyRole(usersRequiredRoles)
  const userListSwrKey = activeMenu === 'users' && canViewUserList ? undefined : null
  const {
    data: userDocs,
    isLoading: usersListLoading,
    error: usersListError,
  } = useFrappeGetDocList<FrappeUserDoc>(
    'User',
    {
      fields: ['name', 'full_name', 'enabled', 'user_type'],
      filters: [['name', '!=', 'Guest']],
      limit: 100,
      orderBy: { field: 'full_name', order: 'asc' },
    },
    userListSwrKey,
    {
      revalidateOnFocus: true,
      shouldRetryOnError: false,
      refreshInterval: activeMenu === 'users' ? 5000 : 0,
    },
  )

  const users: UserRow[] = (userDocs ?? []).map((u) => ({
    id: u.name,
    name: (u.full_name || u.name).trim() || u.name,
    type: (u.user_type || '—').trim(),
    status:
      u.enabled === 0 || u.enabled === false ? 'INACTIVE' : 'ACTIVE',
    primaryLocation: '—',
    locationRights: '—',
  }))

  useEffect(() => {
    return subscribeKeycloakSessionLost(() => {
      setAuthRevision((n) => n + 1)
    })
  }, [])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== PORTAL_LOGOUT_SYNC_KEY || !event.newValue) {
        return
      }
      if (!isKeycloakAuthenticated()) {
        return
      }
      void logoutFromKeycloak().catch(() => {
        setAuthRevision((n) => n + 1)
        setActiveMenu('applications')
        navigate('/', { replace: true })
      })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [navigate])

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
    setLoading(false)
  }

  const openApplication = (app: ApplicationCard) => {
    if (!app.launchUrl || app.status !== 'active') {
      return
    }
    if (!hasCurrentUserAnyRole(app.requiredRoles || [])) {
      setAppAccessDenied(app.name)
      return
    }
    setAppAccessDenied(null)
    // Avoid `_blank` alone (some browsers treat it like noopener). Use a unique name + no feature string
    // so `window.opener` stays usable for Frappe postMessage after logout.
    const targetName = `kalyan-erp-${app.id}-${Date.now()}`
    const child = window.open(app.launchUrl, targetName)
    if (child) {
      trackedAppWindowsRef.current.push({
        window: child,
        logoutUrl: resolveApplicationLogoutUrl(app.launchUrl),
      })
    }
  }

  function resolveApplicationLogoutUrl(launchUrl: string) {
    const fallbackOrigin = (() => {
      try {
        return new URL(launchUrl, window.location.href).origin
      } catch {
        return null
      }
    })()
    try {
      const parsed = new URL(launchUrl, window.location.href)
      const redirectUriParam = parsed.searchParams.get('redirect_uri')
      if (redirectUriParam) {
        const redirectUri = new URL(decodeURIComponent(redirectUriParam))
        return `${redirectUri.origin}/api/method/keycloak_integration.utils.sso_logout?redirect_to=${encodeURIComponent(window.location.origin)}`
      }
    } catch {
      // Fall through to origin-only construction below.
    }
    if (!fallbackOrigin) {
      return null
    }
    return `${fallbackOrigin}/api/method/keycloak_integration.utils.sso_logout?redirect_to=${encodeURIComponent(window.location.origin)}`
  }

  const notifyTrackedAppsToLogout = () => {
    const trackedApps = trackedAppWindowsRef.current
    if (trackedApps.length === 0) {
      return
    }
    for (const entry of trackedApps) {
      if (entry.window.closed || !entry.logoutUrl) {
        continue
      }
      try {
        // Cross-origin navigation is allowed on a retained window handle and enforces app-side logout.
        entry.window.location.assign(entry.logoutUrl)
      } catch {
        // Ignore per-window navigation errors; central logout still proceeds.
      }
    }
    trackedAppWindowsRef.current = trackedApps.filter((entry) => !entry.window.closed)
  }

  const maintenance = isMaintenanceMode()
  const availableApplications = applications.filter((app) => app.status === 'active')
  const noAccessFromQuery = (() => {
    const value = new URLSearchParams(location.search).get('no_access')?.toLowerCase()
    return value === '1' || value === 'true' || value === 'yes'
  })()
  const noAccess =
    !maintenance &&
    (isNoAccessForced() ||
      noAccessFromQuery ||
      Boolean(appAccessDenied) ||
      availableApplications.length === 0)

  useEffect(() => {
    if (!noAccessFromQuery) {
      return
    }
    // Fan out logout to other portal tabs even when this tab is already unauthenticated.
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
  }, [isAuthenticated, navigate, noAccessFromQuery])

  const sessionEmail = getCurrentUserLabel()
  const displayName = getCurrentUserDisplayName() || 'User'
  const noAccessProfile = resolveNoAccessProfile({
    sessionEmail,
    sessionName: displayName,
  })
  const maintenanceInfo = getMaintenanceInfo()

  const filteredApplications = applications.filter((app) =>
    app.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  const filteredUsers = users.filter((item) =>
    item.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  const handlePortalLogout = async () => {
    setError('')
    notifyTrackedAppsToLogout()
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
    setAppAccessDenied(null)
    if (location.search) {
      navigate(APPLICATIONS_PATH, { replace: true })
    }
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
              title={appAccessDenied ? 'No Rights' : undefined}
              lead={
                appAccessDenied
                  ? `You do not have permission to access ${appAccessDenied}.`
                  : noAccessFromQuery
                  ? 'We could not complete sign-in to the selected application.'
                  : undefined
              }
              statusLabel={
                appAccessDenied
                  ? 'Application Access Denied'
                  : noAccessFromQuery
                    ? 'Application Access Failed'
                    : undefined
              }
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
                  All Applications <span>({filteredApplications.length})</span>
                </h2>
                <div className="toolbar-filters">
                  <div className="search-pill">
                    <input
                      className="search-pill-input"
                      type="search"
                      placeholder="Search application"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
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
              <div className="apps-grid">
                {filteredApplications.map((app) => (
                  <article key={app.id} className="app-card">
                    <div className="app-head">
                      <div className="app-title-wrap">
                        <div className="app-icon">
                          <svg viewBox="0 0 20 20" aria-hidden="true">
                            <rect x="3" y="4" width="14" height="12" rx="2" />
                            <line x1="3" y1="8" x2="17" y2="8" />
                          </svg>
                        </div>
                        <div>
                          <h3>{app.name}</h3>
                          <small>{app.usage}</small>
                        </div>
                      </div>
                      <span className={`status-pill ${app.status}`}>
                        <i />
                        {app.status.toUpperCase()}
                      </span>
                    </div>
                    <p>{app.description}</p>
                    <div className="app-footer">
                      <button
                        className="app-open-btn"
                        type="button"
                        aria-label={`Open ${app.name}`}
                        disabled={app.status !== 'active'}
                        onClick={() => openApplication(app)}
                      >
                        <img
                          src={app.status === 'active' ? '/BlackButton.svg' : '/GreyButton.svg'}
                          alt=""
                        />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {!maintenance && activeMenu === 'users' ? (
            !canViewUserList ? (
              <NoAccessView
                profile={noAccessProfile}
                title="No Rights"
                lead="You do not have permission to access the Users section."
                statusLabel="Users Access Denied"
                onBackToPortal={handleBackToApplicationsDashboard}
                onLogout={handlePortalLogout}
              />
            ) : usersListError ? (
              <NoAccessView
                profile={noAccessProfile}
                title="No Rights"
                lead="We could not validate your access to the Users section right now."
                statusLabel="Access Validation Failed"
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
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
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
                            No users found.
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

            <button
              className="login-btn"
              type="button"
              disabled={loading}
              onClick={() => void handleLoginWithKeycloak()}
            >
              {loading ? 'Redirecting...' : 'Login with Keycloak'}
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
