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
  message?: FrappeMessage
  exc?: unknown
  _server_messages?: string
}

function resolveFrappeBaseUrl() {
  return (
    import.meta.env.VITE_FRAPPE_BASE_URL?.trim() ||
    window.location.origin
  ).replace(/\/+$/, '')
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
    const errorMessage =
      typeof data?.message === 'string' ? data.message : fallback
    throw new Error(errorMessage)
  }

  if (payload.rememberMe) {
    localStorage.setItem('kalyan_remember_usr', payload.usr)
  } else {
    localStorage.removeItem('kalyan_remember_usr')
  }

  return data
}

export function getPostLoginRedirect() {
  const query = new URLSearchParams(window.location.search)
  return query.get('redirect') || import.meta.env.VITE_DEFAULT_POST_LOGIN_URL || '/'
}
