/**
 * TRACK — centralized API client.
 *
 * - All requests go through this module so base URLs are never scattered.
 * - Session cookie based authentication (`credentials: 'include'`).
 * - CSRF: the Django `csrftoken` cookie is echoed back in the `X-CSRFToken`
 *   header for every unsafe method. The cookie is guaranteed by `ensureCsrf()`.
 * - No tokens or passwords are ever written to browser storage.
 */

const RAW_BASE = import.meta.env.VITE_API_BASE_URL || '/api'
export const API_BASE = RAW_BASE.replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(message, status, details = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

function readCookie(name) {
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + name + '=([^;]*)')
  )
  return match ? decodeURIComponent(match[1]) : null
}

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

async function request(path, { method = 'GET', body, params, signal } = {}) {
  const unsafe = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
  const headers = { Accept: 'application/json' }

  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (unsafe) {
    const token = readCookie('csrftoken')
    if (token) headers['X-CSRFToken'] = token
  }

  let response
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      credentials: 'include',
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

/** Makes sure the CSRF cookie exists before the first unsafe request. */
let csrfPromise = null
function ensureCsrf() {
  if (!csrfPromise) {
    csrfPromise = fetch(`${API_BASE}/auth/csrf/`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
      .then(() => undefined)
      .catch(() => undefined)
  }
  return csrfPromise
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  list,
  post: async (path, body, opts) => {
    await ensureCsrf()
    return request(path, { ...opts, method: 'POST', body })
  },
  patch: async (path, body, opts) => {
    await ensureCsrf()
    return request(path, { ...opts, method: 'PATCH', body })
  },
  put: async (path, body, opts) => {
    await ensureCsrf()
    return request(path, { ...opts, method: 'PUT', body })
  },
  delete: async (path, opts) => {
    await ensureCsrf()
    return request(path, { ...opts, method: 'DELETE' })
  },
  ensureCsrf,

  /* Auth helpers */
  login: async (username, password) => {
    await ensureCsrf()
    return request('/auth/login/', {
      method: 'POST',
      body: { username, password },
    })
  },
  logout: async () => {
    await ensureCsrf()
    return request('/auth/logout/', { method: 'POST', body: {} })
  },
  me: () => request('/auth/me/'),
}

export default api
