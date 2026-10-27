/**
 * TRACK — centralized API client.
 *
 * Production (split-origin: Vercel frontend + Render backend):
 *   Uses DRF Token authentication — `Authorization: Token <key>` header.
 *   Token is stored in sessionStorage (cleared when the tab closes).
 *   No cookies, no CSRF needed — works cross-origin without any browser
 *   restrictions.
 *
 *   Account-less enrollment applicants get a `Guest <key>` header instead
 *   (stored as `track.enrollment.guest`); the auth token always wins when
 *   both are present. See authHeader().
 *
 * Development (same-origin via Vite proxy):
 *   Same token flow — the Vite proxy forwards /api/* to Django, so the
 *   token header passes through unchanged.
 */

const RAW_BASE = import.meta.env.VITE_API_BASE_URL || '/api'
export const API_BASE = RAW_BASE.replace(/\/+$/, '')

const TOKEN_KEY = 'track.auth.token'
const GUEST_TOKEN_KEY = 'track.enrollment.guest'

export class ApiError extends Error {
  constructor(message, status, details = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

/* ------------------------------------------------------------------ */
/* Token storage (sessionStorage — cleared on tab close)               */
/* ------------------------------------------------------------------ */

function getStoredToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

// Exported so AuthProvider can skip the pointless /auth/me/ round-trip when
// this browser holds no credential at all (token auth is the only sign-in
// path, so such a request could only ever answer 401).
export { getStoredToken }

function setStoredToken(token) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token)
  } catch {}
}

function clearStoredToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {}
}

/* ------------------------------------------------------------------ */
/* Guest enrollment credential (account-less application flow)         */
/* ------------------------------------------------------------------ */

/** Guest token issued by the public enrollment endpoints, or null. */
export function getGuestToken() {
  try {
    return sessionStorage.getItem(GUEST_TOKEN_KEY)
  } catch {
    return null
  }
}

/** Store the guest token returned by a public application / track request. */
export function setGuestToken(token) {
  try {
    if (token) sessionStorage.setItem(GUEST_TOKEN_KEY, token)
  } catch {}
}

/** Drop the guest credential (e.g. when it is no longer meaningful). */
export function clearGuestToken() {
  try {
    sessionStorage.removeItem(GUEST_TOKEN_KEY)
  } catch {}
}

/**
 * The Authorization header for the current browser state:
 *   stored auth token  → `Token <t>`  (takes precedence)
 *   guest enrollment   → `Guest <t>`  (account-less applicants)
 *   neither            → {}           (fully public endpoints)
 */
export function authHeader() {
  const token = getStoredToken()
  if (token) return { Authorization: `Token ${token}` }
  const guest = getGuestToken()
  if (guest) return { Authorization: `Guest ${guest}` }
  return {}
}

/* ------------------------------------------------------------------ */
/* Request plumbing                                                     */
/* ------------------------------------------------------------------ */

function buildUrl(path, params) {
  const url = /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`
  if (!params) return url
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value)
    }
  })
  const qs = query.toString()
  return qs ? `${url}${url.includes('?') ? '&' : '?'}${qs}` : url
}

/** Flatten DRF error payloads into one readable message. */
function messageFrom(body, fallback) {
  if (!body) return fallback
  if (typeof body === 'string') return body
  // DRF answers some ValidationErrors with a bare list of messages — treat
  // it as messages, not as an object whose keys are indexes ("0: …").
  if (Array.isArray(body)) {
    return body.filter(Boolean).map(String).join(' ') || fallback
  }
  if (body.detail) return body.detail
  if (body.non_field_errors) {
    const list = Array.isArray(body.non_field_errors)
      ? body.non_field_errors
      : [body.non_field_errors]
    return list.join(' ')
  }
  const parts = []
  Object.entries(body).forEach(([field, value]) => {
    const text = Array.isArray(value) ? value.join(' ') : String(value)
    parts.push(`${field === 'non_field_errors' ? '' : field + ': '}${text}`)
  })
  return parts.length ? parts.join(' ') : fallback
}

async function request(path, { method = 'GET', body, params, signal, headers: extraHeaders } = {}) {
  const headers = { Accept: 'application/json', ...extraHeaders }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  Object.assign(headers, authHeader())

  let response
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      signal,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError(
      'Cannot reach the TRACK server. Check that Django is running.',
      0
    )
  }

  if (response.status === 204) return null

  let payload = null
  const text = await response.text()
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!response.ok) {
    throw new ApiError(
      messageFrom(payload, `Request failed (${response.status}).`),
      response.status,
      payload
    )
  }
  return payload
}

/** Follows DRF pagination and returns a plain array (capped at 10 pages). */
async function list(path, { params, signal } = {}) {
  let page = await request(path, {
    params: { ...params, page_size: 100 },
    signal,
  })
  if (Array.isArray(page)) return page
  const results = [...((page && page.results) || [])]
  let pages = 1
  while (page && page.next && pages < 10) {
    page = await request(page.next, { signal })
    if (!page || !Array.isArray(page.results)) break
    results.push(...page.results)
    pages += 1
  }
  return results
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  list,
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  delete: (path, opts) => request(path, { ...opts, method: 'DELETE' }),

  // kept for backward-compat — no-op now (no CSRF needed with token auth)
  ensureCsrf: () => Promise.resolve(),

  /* Auth helpers */
  login: async (username, password) => {
    // Use the token endpoint (same one the mobile app uses)
    const data = await request('/auth/token/', {
      method: 'POST',
      body: { username, password },
    })
    setStoredToken(data.token)
    return data
  },

  logout: async () => {
    try {
      await request('/auth/token/logout/', { method: 'POST', body: {} })
    } catch {
      // Even if the server call fails, clear the local token
    }
    clearStoredToken()
  },

  me: () => request('/auth/me/'),

  /* Public enrollment (account-less) helpers */
  /** Look up an application by reference + guardian email / contact number.
   *  Success saves the returned guest token for follow-up requests. */
  trackApplication: async ({ reference, contact }) => {
    const data = await request('/enrollment/public/track/', {
      method: 'POST',
      body: { reference, contact },
    })
    if (data && data.guest_token) setGuestToken(data.guest_token)
    return data
  },

  /** Exchange the one-time claim token from an enrolled application for a
   *  real account. Stores the returned auth token exactly like login(). */
  claimAccount: async ({ claim_token, username, password }) => {
    const data = await request('/enrollment/claim-account/', {
      method: 'POST',
      body: { claim_token, username, password },
    })
    if (data && data.token) {
      // The backend consumes the guest credential together with the claim —
      // stop presenting a token that no longer exists server-side.
      clearGuestToken()
      setStoredToken(data.token)
    }
    return data ? data.user : null
  },
}

export default api
