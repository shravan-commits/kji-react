import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { getPostLoginRedirect, loginWithFrappe } from './frappeAuth'
import './style.css'

type MenuKey = 'dashboard' | 'applications' | 'users'

type ApplicationCard = {
  id: number
  name: string
  usage: string
  status: 'active' | 'inactive'
  description: string
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
  },
  {
    id: 2,
    name: 'Warehouse Management',
    usage: 'Warehouse Usage',
    status: 'active',
    description: 'Manage inventory movement, stock health, and warehouse operations from one panel.',
  },
  {
    id: 3,
    name: 'Sales Application',
    usage: 'Sales Usage',
    status: 'active',
    description: 'Track opportunities, customer conversion, and regional sales performance in real time.',
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

const recentActivity = [
  { role: 'Admin', message: 'You have a bug that needs to be fixed', time: 'Just now' },
  { role: 'Admin', message: 'You have a bug that needs to be fixed', time: 'Just now' },
  { role: 'Admin', message: 'New user registered', time: 'Just now' },
  { role: 'User', message: 'New user registered', time: '12 hours ago' },
]

const DEFAULT_USERNAME = 'admin@example.com'
const DEFAULT_PASSWORD = 'admin123'

function App() {
  const rememberedUser = useMemo(
    () => localStorage.getItem('kalyan_remember_usr') ?? '',
    [],
  )

  const [usr, setUsr] = useState(rememberedUser || DEFAULT_USERNAME)
  const [pwd, setPwd] = useState(DEFAULT_PASSWORD)
  const [rememberMe, setRememberMe] = useState(Boolean(rememberedUser))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [activeMenu, setActiveMenu] = useState<MenuKey>('dashboard')
  const [search, setSearch] = useState('')

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      await loginWithFrappe({ usr, pwd, rememberMe })
      const redirectUrl = getPostLoginRedirect()
      if (redirectUrl && redirectUrl !== '/') {
        window.location.assign(redirectUrl)
        return
      }
      setIsAuthenticated(true)
    } catch (e) {
      // Local demo fallback when backend credentials are not available.
      if (usr === DEFAULT_USERNAME && pwd === DEFAULT_PASSWORD) {
        setIsAuthenticated(true)
        return
      }
      const message = e instanceof Error ? e.message : 'Login failed.'
      setError(message)
    } finally {
      setLoading(false)
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
                className={activeMenu === 'dashboard' ? 'active' : ''}
                onClick={() => setActiveMenu('dashboard')}
              >
                Dashboard
              </button>
              <button
                className={activeMenu === 'applications' ? 'active' : ''}
                onClick={() => setActiveMenu('applications')}
              >
                My Applications
              </button>
              <button
                className={activeMenu === 'users' ? 'active' : ''}
                onClick={() => setActiveMenu('users')}
              >
                Users
              </button>
            </nav>
          </div>
          <div className="sidebar-bottom">
            <button className="ghost-btn">Settings</button>
            <button
              className="ghost-btn logout"
              onClick={() => {
                setIsAuthenticated(false)
                setActiveMenu('dashboard')
              }}
            >
              Logout
            </button>
          </div>
        </aside>

        <section className="content-shell">
          <header className="topbar">
            <p>
              Dashboard /{' '}
              {activeMenu === 'dashboard'
                ? 'Overview'
                : activeMenu === 'applications'
                  ? 'Applications'
                  : 'Users'}
            </p>
            <div className="profile-mini">
              <strong>Surendar V</strong>
              <span>{usr || 'admin@kalyan.local'}</span>
            </div>
          </header>

          {activeMenu === 'dashboard' ? (
            <section className="view-wrap">
              <h1>Welcome back,</h1>
              <p className="view-subtitle">
                Your enterprise ecosystem is performing optimally today.
              </p>
              <div className="stats-grid">
                <article className="stat-card stat-one">
                  <h3>149</h3>
                  <p>Total Applications</p>
                </article>
                <article className="stat-card stat-two">
                  <h3>149</h3>
                  <p>Total Users</p>
                </article>
                <article className="stat-card stat-three">
                  <h3>149</h3>
                  <p>New User</p>
                </article>
                <article className="stat-card stat-four">
                  <h3>80%</h3>
                  <p>System Status</p>
                </article>
                <article className="stat-card stat-five">
                  <h3>67</h3>
                  <p>Active Applications</p>
                </article>
              </div>
              <div className="dashboard-main-grid">
                <div className="dashboard-left-column">
                  <div className="chart-card">
                    <div className="chart-header">
                      <h4>Total Users</h4>
                      <div className="chart-legend">
                        <span className="legend-item black-dot">Current Week</span>
                        <span className="legend-item blue-dot">Previous Week</span>
                      </div>
                    </div>
                    <div className="chart-body">
                      <div className="y-axis-labels">
                        <span>30M</span>
                        <span>20M</span>
                        <span>10M</span>
                        <span>0</span>
                      </div>
                      <div className="plot-area">
                        <svg viewBox="0 0 780 330" className="activity-chart-svg">
                          <line x1="0" y1="30" x2="780" y2="30" className="grid-line" />
                          <line x1="0" y1="125" x2="780" y2="125" className="grid-line" />
                          <line x1="0" y1="220" x2="780" y2="220" className="grid-line" />
                          <line x1="0" y1="315" x2="780" y2="315" className="grid-line" />

                          <path
                            d="M 35 160 C 170 75, 285 55, 420 125 S 650 260, 755 85"
                            className="blue-path"
                          />
                          <path
                            d="M 35 140 C 175 235, 300 235, 430 148"
                            className="black-path"
                          />
                          <path
                            d="M 430 148 C 535 85, 640 58, 755 72"
                            className="dotted-path"
                          />

                          <circle cx="285" cy="114" r="8" className="hover-point" />
                        </svg>
                        <div className="chart-tooltip">3,256,598</div>
                        <div className="x-axis-months">
                          <span>Jan</span>
                          <span>Feb</span>
                          <span>Mar</span>
                          <span>Apr</span>
                          <span>May</span>
                          <span>Jun</span>
                          <span>Jul</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="table-card">
                    <h4>Recent Users</h4>
                    <table>
                      <thead>
                        <tr>
                          <th>Protal UID</th>
                          <th>Name</th>
                          <th>Status</th>
                          <th>Primary Location</th>
                          <th>Location Rights</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.slice(0, 4).map((item) => (
                          <tr key={`recent-${item.id}`}>
                            <td>{item.id}</td>
                            <td>{item.name}</td>
                            <td>
                              <span className="pill green">{item.status}</span>
                            </td>
                            <td>{item.primaryLocation}</td>
                            <td>{item.locationRights}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button className="view-more-btn" type="button">
                      View More
                    </button>
                  </div>
                </div>
                <div className="dashboard-right-column">
                  <div className="side-card">
                    <h4>Quick Action</h4>
                    <ul>
                      <li>Hr Application</li>
                      <li>Warehouse Management</li>
                      <li>Sales Application</li>
                      <li>Stock Management</li>
                    </ul>
                  </div>
                  <div className="side-card">
                    <h4>Recently Activity</h4>
                    <div className="activity-list">
                      {recentActivity.map((item, index) => (
                        <div className="activity-item" key={`${item.role}-${index}`}>
                          <strong>{item.role}</strong>
                          <p>{item.message}</p>
                          <span>{item.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {activeMenu === 'applications' ? (
            <section className="view-wrap">
              <h1>Integrated Applications</h1>
              <p className="view-subtitle">
                Curate and manage your enterprise application stack from one place.
              </p>
              <div className="table-toolbar">
                <h2>All Applications</h2>
                <input
                  placeholder="Search application"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="apps-grid">
                {applications
                  .filter((app) =>
                    app.name.toLowerCase().includes(search.trim().toLowerCase()),
                  )
                  .map((app) => (
                    <article key={app.id} className="app-card">
                      <div className="app-head">
                        <h3>{app.name}</h3>
                        <span className={app.status}>{app.status.toUpperCase()}</span>
                      </div>
                      <small>{app.usage}</small>
                      <p>{app.description}</p>
                    </article>
                  ))}
              </div>
            </section>
          ) : null}

          {activeMenu === 'users' ? (
            <section className="view-wrap">
              <h1>Our Users</h1>
              <p className="view-subtitle">
                Access detailed information and manage user records seamlessly.
              </p>
              <div className="table-toolbar">
                <h2>User List</h2>
                <input
                  placeholder="Search user"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="table-card">
                <table>
                  <thead>
                    <tr>
                      <th>Protal UID</th>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Primary Location</th>
                      <th>Location Rights</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users
                      .filter((item) =>
                        item.name.toLowerCase().includes(search.trim().toLowerCase()),
                      )
                      .map((item) => (
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
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </section>
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
          <h1>LOGIN TO KALYAN</h1>
          <p>
            Unified authentication portal for multiple Kalyan applications.
          </p>
        </div>
      </section>

      <section className="form-panel">
        <form className="login-card" onSubmit={handleLogin}>
          <h2>WELCOME BACK</h2>
          <p className="subtitle">
            Enter your email and password to access your account
          </p>

          <label htmlFor="usr">Email or username</label>
          <input
            id="usr"
            type="text"
            placeholder="Enter your email"
            value={usr}
            onChange={(event) => setUsr(event.target.value)}
            required
          />

          <label htmlFor="pwd">Password</label>
          <input
            id="pwd"
            type="password"
            placeholder="Enter your password"
            value={pwd}
            onChange={(event) => setPwd(event.target.value)}
            required
          />

          <div className="form-row">
            <label className="remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
              />
              Remember me
            </label>
            <a href="/forgot-password">Forgot Password</a>
          </div>

          {error ? <p className="error-text">{error}</p> : null}

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>

          <div className="divider">or</div>

          <button
            className="google-btn"
            type="button"
            onClick={() => {
              const url =
                import.meta.env.VITE_GOOGLE_AUTH_URL || '/api/method/google_login'
              window.location.assign(url)
            }}
          >
            Continue with Google
          </button>
        </form>
      </section>
    </main>
  )
}

export default App
