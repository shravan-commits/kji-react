import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  getCurrentUserLabel,
  isKeycloakAuthenticated,
  loginWithKeycloak,
  logoutFromKeycloak,
} from './keycloakAuth'
import {
  getFrappeLoginRedirectUrl,
  getFrappeSessionUser,
  logoutFromFrappe,
} from './frappeAuth'
import { isDemoMode } from './demoMode'
import {
  getMaintenanceInfo,
  isMaintenanceMode,
  isNoAccessForced,
  resolveNoAccessProfile,
} from './portalState'
import { FullMaintenanceView, NoAccessView } from './portalViews'
import './style.css'

type MenuKey = 'dashboard' | 'applications' | 'users'

type ApplicationCard = {
  id: number
  name: string
  usage: string
  status: 'active' | 'inactive'
  description: string
  launchUrl?: string
}

type UserRow = {
  id: string
  name: string
  type: string
  status: 'ACTIVE' | 'INACTIVE'
  primaryLocation: string
  locationRights: string
}

const applications: ApplicationCard[] = [
  {
    id: 1,
    name: 'HR Application',
    usage: 'HR Usage',
    status: 'active',
    description: 'Advanced predictive modeling and data visualization for supply chain management.',
    launchUrl: import.meta.env.VITE_APP_HR_URL,
  },
  {
    id: 2,
    name: 'Warehouse Management',
    usage: 'Warehouse Usage',
    status: 'active',
    description: 'Manage inventory movement, stock health, and warehouse operations from one panel.',
    launchUrl: import.meta.env.VITE_APP_WAREHOUSE_URL,
  },
  {
    id: 3,
    name: 'Sales Application',
    usage: 'Sales Usage',
    status: 'active',
    description: 'Track opportunities, customer conversion, and regional sales performance in real time.',
    launchUrl: import.meta.env.VITE_APP_SALES_URL,
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
  },
  {
    id: 6,
    name: 'Quality Control',
    usage: 'Quality Usage',
    status: 'inactive',
    description: 'This application is currently inactive and not available for use.',
  },
]

const users: UserRow[] = Array.from({ length: 10 }, (_, index) => ({
  id: `KJ - EMP - 00012${index}`,
  name: 'Muhammed Rahman',
  type: 'ADMIN',
  status: 'ACTIVE',
  primaryLocation: 'Malappuram',
  locationRights: 'Dubai Gold Souk',
}))

function App() {
  const demo = isDemoMode()
  const [isFrappeAuthenticated, setIsFrappeAuthenticated] = useState(demo)
  const [hasKeycloakSession, setHasKeycloakSession] = useState(
    demo || isKeycloakAuthenticated(),
  )
  const [checkingFrappeSession, setCheckingFrappeSession] = useState(!demo)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeMenu, setActiveMenu] = useState<MenuKey>('applications')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (demo) {
      return
    }

    let mounted = true

    async function bootstrapFrappeSession() {
      try {
        const loggedInUser = await getFrappeSessionUser()
        if (!mounted) {
          return
        }
        setIsFrappeAuthenticated(Boolean(loggedInUser))
      } catch {
        if (!mounted) {
          return
        }
        setIsFrappeAuthenticated(false)
      } finally {
        if (mounted) {
          setCheckingFrappeSession(false)
        }
      }
    }

    void bootstrapFrappeSession()
    return () => {
      mounted = false
    }
  }, [demo])

  useEffect(() => {
    if (demo || checkingFrappeSession || isFrappeAuthenticated) {
      return
    }
    window.location.assign(getFrappeLoginRedirectUrl())
  }, [demo, checkingFrappeSession, isFrappeAuthenticated])

  const handleKeycloakLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      await loginWithKeycloak()
      setHasKeycloakSession(true)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Keycloak login failed.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const openApplication = (app: ApplicationCard) => {
    if (!app.launchUrl || app.status !== 'active') {
      return
    }
    window.open(app.launchUrl, '_blank', 'noopener,noreferrer')
  }

  const maintenance = isMaintenanceMode()
  const availableApplications = applications.filter((app) => app.status === 'active')
  const noAccess =
    !maintenance &&
    (isNoAccessForced() || availableApplications.length === 0)

  const sessionEmail = demo
    ? 'demo@kalyan.local'
    : getCurrentUserLabel() || undefined
  const noAccessProfile = resolveNoAccessProfile({
    sessionEmail,
    sessionName: 'Kalyan Admin',
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
    if (demo) {
      window.location.reload()
      return
    }
    try {
      await logoutFromFrappe()
    } catch {
      // Ignore logout API errors and continue local cleanup.
    }
    try {
      await logoutFromKeycloak()
    } catch {
      // Ignore Keycloak redirect errors and continue local cleanup.
    }
    setHasKeycloakSession(false)
    setIsFrappeAuthenticated(false)
    setActiveMenu('applications')
  }

  if (demo || (isFrappeAuthenticated && hasKeycloakSession)) {
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
              {demo ? (
                <span className="demo-badge" title="No Frappe/Keycloak; UI only">
                  Demo mode
                </span>
              ) : null}
              <div className="profile-mini">
                <img src="/UserIcon.svg" alt="Profile" className="profile-avatar" />
                <div className="profile-details">
                  <strong>Kalyan Admin</strong>
                  <span>
                    {demo
                      ? 'demo@kalyan.local'
                      : getCurrentUserLabel() || 'authenticated@kalyan.local'}
                  </span>
                </div>
              </div>
            </div>
          </header>

          {maintenance ? (
            <FullMaintenanceView
              info={maintenanceInfo}
              onBackToPortal={() => setActiveMenu('applications')}
            />
          ) : null}

          {!maintenance && activeMenu === 'applications' && noAccess ? (
            <NoAccessView
              profile={noAccessProfile}
              onBackToPortal={() => setActiveMenu('applications')}
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
                      <div className="app-users">
                        <div className="avatar-stack" aria-hidden="true">
                          <span>👨🏻‍💼</span>
                          <span>👩🏽‍💼</span>
                          <span>40+</span>
                        </div>
                        <strong>Users</strong>
                      </div>
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
                    {filteredUsers.map((item) => (
                        <tr key={item.id}>
                          <td>{item.id}</td>
                          <td>{item.name}</td>
                          <td>
                            <span className="pill muted">{item.type}</span>
                          </td>
                          <td>
                            <span className="pill green">{item.status}</span>
                          </td>
                          <td>{item.primaryLocation}</td>
                          <td>{item.locationRights}</td>
                          <td>
                            <button type="button" className="user-row-action">
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="user-list-view-more-wrap">
                <button type="button" className="user-list-view-more">
                  View More
                  <span className="user-list-view-more-arrow" aria-hidden>
                    →
                  </span>
                </button>
              </div>
            </section>
          ) : null}
        </section>
      </main>
    )
  }

  if (isFrappeAuthenticated) {
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
              Complete Keycloak sign-in to access all integrated applications without
              additional logins.
            </p>
          </div>
        </section>

        <section className="form-panel">
          <form className="login-card" onSubmit={handleKeycloakLogin}>
            <h2>KEYCLOAK LOGIN</h2>
            <p className="subtitle">
              This step enables single sign-on for all applications listed inside this
              portal.
            </p>

            {error ? <p className="error-text">{error}</p> : null}

            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? 'Logging in...' : 'Continue with Keycloak'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  if (checkingFrappeSession) {
    return (
      <main className="login-page">
        <section className="form-panel">
          <div className="login-card">
            <h2>Loading</h2>
            <p className="subtitle">Checking your portal session...</p>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="login-page">
      <section className="form-panel">
        <div className="login-card">
          <h2>Redirecting</h2>
          <p className="subtitle">Taking you to Frappe login...</p>
        </div>
      </section>
    </main>
  )
}

export default App
