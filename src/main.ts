import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initializeKeycloak } from './keycloakAuth'

async function bootstrap() {
  try {
    await initializeKeycloak()
  } catch (error) {
    console.error('Keycloak initialization failed:', error)
  }

  ReactDOM.createRoot(document.getElementById('app') as HTMLElement).render(
    React.createElement(React.StrictMode, null, React.createElement(App)),
  )
}

void bootstrap()
