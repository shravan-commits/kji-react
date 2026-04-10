export type LoginPayload = {
  usr: string
  pwd: string
  rememberMe: boolean
}

type FrappeMessage = {
  message?: string
  full_name?: string
  home_page?: string
}

type FrappeLoginResponse = {
  message?: FrappeMessage | string
  exc?: unknown
  _server_messages?: string
}

type FrappeSessionUserResponse = {
  message?: string
}

/** Frappe site origin for login redirects and direct API calls (matches SDK public URL). */
export function resolveFrappeBaseUrl() {
  const explicit = import.meta.env.VITE_FRAPPE_URL?.trim()
  if (explicit) {
    return explicit.replace(/\/+$/, '')
  }
  const base = import.meta.env.VITE_FRAPPE_BASE_URL?.trim()
  if (base) {
    return base.replace(/\/+$/, '')
  }
  return window.location.origin.replace(/\/+$/, '')
}

/** Send users to Frappe login; after login Frappe should redirect back to this app. */
export function getFrappeLoginRedirectUrl() {
  const custom = import.meta.env.VITE_FRAPPE_LOGIN_URL?.trim()
  const returnUrl = window.location.href
  if (custom) {
    const sep = custom.includes('?') ? '&' : '?'
    return `${custom}${sep}redirect-to=${encodeURIComponent(returnUrl)}`
  }
  const baseUrl = resolveFrappeBaseUrl()
  return `${baseUrl}/login?redirect-to=${encodeURIComponent(returnUrl)}`
}

export async function loginWithFrappe(payload: LoginPayload) {
  const baseUrl = resolveFrappeBaseUrl()
  const body = new URLSearchParams({
    usr: payload.usr,
    pwd: payload.pwd,
  })

  const response = await fetch(`${baseUrl}/api/method/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    credentials: 'include',
    body: body.toString(),
  })

  let data: FrappeLoginResponse | null = null
  try {
    data = (await response.json()) as FrappeLoginResponse
  } catch {
    data = null
  }

  if (!response.ok) {
    const fallback = 'Unable to login. Please check your credentials.'
    const errorMessage = resolveFrappeErrorMessage(data, fallback)
    throw new Error(errorMessage)
  }

  if (payload.rememberMe) {
    localStorage.setItem('kalyan_remember_usr', payload.usr)
  } else {
    localStorage.removeItem('kalyan_remember_usr')
  }

  return data
}

export async function getFrappeSessionUser() {
  const baseUrl = resolveFrappeBaseUrl()
  const response = await fetch(`${baseUrl}/api/method/frappe.auth.get_logged_user`, {
    method: 'GET',
    credentials: 'include',
  })

  if (!response.ok) {
    return null
  }

  let data: FrappeSessionUserResponse | null = null
  try {
    data = (await response.json()) as FrappeSessionUserResponse
  } catch {
    data = null
  }

  if (!data?.message || data.message === 'Guest') {
    return null
  }

  return data.message
}

export async function logoutFromFrappe() {
  const baseUrl = resolveFrappeBaseUrl()
  await fetch(`${baseUrl}/api/method/logout`, {
    method: 'POST',
    credentials: 'include',
  })
}

function resolveFrappeErrorMessage(
  data: FrappeLoginResponse | null,
  fallback: string,
) {
  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message
  }

  if (typeof data?._server_messages === 'string' && data._server_messages.trim()) {
    try {
      const firstLayer = JSON.parse(data._server_messages) as string[]
      const firstMessage = firstLayer[0]
      if (!firstMessage) {
        return fallback
      }
      const parsedMessage = JSON.parse(firstMessage) as { message?: string }
      if (parsedMessage.message) {
        return parsedMessage.message
      }
    } catch {
      return fallback
    }
  }

  return fallback
}
