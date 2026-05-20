import type { MaintenanceInfo, NoAccessProfile } from './portalState'

type NoAccessViewProps = {
  profile: NoAccessProfile
  onBackToPortal: () => void
  onLogout: () => void
  showBackToPortal?: boolean
  title?: string
  lead?: string
  statusLabel?: string
}

export function NoAccessView({
  profile,
  onBackToPortal,
  onLogout,
  showBackToPortal = true,
  title,
  lead,
  statusLabel,
}: NoAccessViewProps) {
  return (
    <section className="portal-state-page no-access-page" aria-labelledby="no-access-title">
      <div className="portal-state-stack">
        <div className="portal-state-icon-ring" aria-hidden>
          <img
            src="/noaccessLogo.svg"
            alt=""
            className="portal-state-logo"
            width={150}
            height={150}
          />
        </div>
        <h2 id="no-access-title" className="portal-state-heading">
          {title || 'No Rights'}
        </h2>
        <p className="portal-state-lead">
          {lead ||
            "You currently don't have rights to access any applications in the portal."}
        </p>
        <div className="portal-state-card no-access-card">
          <dl className="portal-state-dl">
            <div className="portal-state-dl-row">
              <dt>Portal UID</dt>
              <dd>{profile.portalUid}</dd>
            </div>
            <div className="portal-state-dl-row">
              <dt>Name</dt>
              <dd>{profile.name}</dd>
            </div>
            <div className="portal-state-dl-row">
              <dt>Email</dt>
              <dd>{profile.email}</dd>
            </div>
            <div className="portal-state-dl-row">
              <dt>Status</dt>
              <dd>
                <span className="portal-state-status-bad">{statusLabel || 'No Apps Assigned'}</span>
              </dd>
            </div>
          </dl>
        </div>
        <div className="portal-state-actions">
          <div
            className={`portal-state-btn-row${showBackToPortal ? '' : ' logout-only'}`}
          >
            {showBackToPortal ? (
              <button
                type="button"
                className="portal-state-btn secondary"
                onClick={onBackToPortal}
              >
                Back To Portal Dashboard
              </button>
            ) : null}
            <button
              type="button"
              className="portal-state-btn secondary danger"
              onClick={onLogout}
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

type CentralPortalUnavailableViewProps = {
  info: MaintenanceInfo
  onRetry: () => void
}

export function CentralPortalUnavailableView({
  info,
  onRetry,
}: CentralPortalUnavailableViewProps) {
  return (
    <section
      className="portal-state-page maintenance-page"
      aria-labelledby="portal-unavailable-title"
    >
      <div className="portal-state-stack">
        <div className="portal-state-icon-ring maintenance-ring" aria-hidden>
          <img
            src="/maintenanceLogo.svg"
            alt=""
            className="portal-state-logo maintenance-logo"
            width={134}
            height={134}
          />
        </div>
        <h2 id="portal-unavailable-title" className="portal-state-heading">
          We&apos;ll Be Right Back
        </h2>
        <p className="portal-state-lead">
          The Central Portal is currently unavailable due to maintenance. Please try
          again after some time.
        </p>
        <div className="portal-state-card maintenance-meta-card">
          <div className="maintenance-meta-grid">
            <div>
              <p className="maintenance-meta-label">Estimated Duration</p>
              <p className="maintenance-meta-value">{info.duration}</p>
              <p className="maintenance-meta-sub">{info.until}</p>
            </div>
            <div>
              <p className="maintenance-meta-label">Maintenance Type</p>
              <p className="maintenance-meta-value">{info.type}</p>
              <p className="maintenance-meta-sub">{info.subtype}</p>
            </div>
          </div>
        </div>
        <div className="portal-state-actions">
          <button type="button" className="portal-state-btn primary" onClick={onRetry}>
            Retry Connection
          </button>
        </div>
      </div>
    </section>
  )
}

type FullMaintenanceViewProps = {
  info: MaintenanceInfo
  onBackToPortal: () => void
}

export function FullMaintenanceView({
  info,
  onBackToPortal,
}: FullMaintenanceViewProps) {
  return (
    <section
      className="portal-state-page maintenance-page"
      aria-labelledby="maintenance-title"
    >
      <div className="portal-state-stack">
        <div className="portal-state-icon-ring maintenance-ring" aria-hidden>
          <img
            src="/maintenanceLogo.svg"
            alt=""
            className="portal-state-logo maintenance-logo"
            width={134}
            height={134}
          />
        </div>
        <h2 id="maintenance-title" className="portal-state-heading">
          We&apos;ll Be Right Back
        </h2>
        <p className="portal-state-lead">
          The Central Portal is currently undergoing scheduled maintenance. We
          apologize for any inconvenience.
        </p>
        <div className="portal-state-card maintenance-meta-card">
          <div className="maintenance-meta-grid">
            <div>
              <p className="maintenance-meta-label">Estimated Duration</p>
              <p className="maintenance-meta-value">{info.duration}</p>
              <p className="maintenance-meta-sub">{info.until}</p>
            </div>
            <div>
              <p className="maintenance-meta-label">Maintenance Type</p>
              <p className="maintenance-meta-value">{info.type}</p>
              <p className="maintenance-meta-sub">{info.subtype}</p>
            </div>
          </div>
        </div>
        <div className="portal-state-actions">
          <button
            type="button"
            className="portal-state-btn primary"
            onClick={onBackToPortal}
          >
            Back To Portal Dashboard
          </button>
        </div>
      </div>
    </section>
  )
}
