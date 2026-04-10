import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { isDemoMode } from './demoMode'
import { initializeKeycloak } from './keycloakAuth'

async function bootstrap() {
  if (!isDemoMode()) {
    try {
      await initializeKeycloak()
    } catch (error) {
      console.error('Keycloak initialization failed:', error)
    }
  }

  ReactDOM.createRoot(document.getElementById('app') as HTMLElement).render(
    React.createElement(React.StrictMode, null, React.createElement(App)),
  )
}

void bootstrap()
