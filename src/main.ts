import axios from 'axios'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { initializeKeycloak, installFrappeAppLogoutPostMessageListener } from './keycloakAuth'

// Send session cookies with every Frappe API call so Frappe sees the logged-in user, not Guest.
axios.defaults.withCredentials = true

async function bootstrap() {
  try {
    await initializeKeycloak()
  } catch (error) {
    console.error('Keycloak initialization failed:', error)
  }
  installFrappeAppLogoutPostMessageListener()

  ReactDOM.createRoot(document.getElementById('app') as HTMLElement).render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(
        BrowserRouter,
        null,
        React.createElement(App),
      ),
    ),
  )
}

void bootstrap()
