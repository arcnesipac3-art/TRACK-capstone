import { beforeEach, describe, expect, it, vi } from 'vitest'
import { API_BASE } from './api'

/**
 * The API client memoises the CSRF probe in module-level state, so tests that
 * care about fetch call counts must get a genuinely fresh module. `api.js` has
 * no side effects on import, so a re-import is cheap and safe.
 */
async function freshApi() {
  vi.resetModules()
  const mod = await import('./api')
  // Return ApiError from the *same* module instance so `toBeInstanceOf`
  // checks pass — a reset module defines a new class identity.
  return { api: mod.api, ApiError: mod.ApiError }
}

/** Builds a minimal Response-like object for the mocked fetch. */
function jsonResponse(body, { status = 200, ok } = {}) {
  return {
    ok: ok ?? status < 400,
    status,
    text: async () => (body === null ? '' : JSON.stringify(body)),
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  global.fetch = vi.fn()
  document.cookie = 'csrftoken=test-csrf-token'
})

describe('buildUrl / API_BASE', () => {
  it('prefixes relative paths with the configured base', async () => {
    const { api } = await freshApi()
    global.fetch.mockResolvedValue(jsonResponse({}))
    await api.get('/users/')
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/users/`,
      expect.any(Object)
    )
  })

  it('leaves absolute URLs untouched', async () => {
    const { api } = await freshApi()
    global.fetch.mockResolvedValue(jsonResponse({}))
    await api.get('http://example.com/next-page/')
    expect(global.fetch).toHaveBeenCalledWith(
      'http://example.com/next-page/',
      expect.any(Object)
    )
  })

  it('serialises params and skips empty ones', async () => {
    const { api } = await freshApi()
    global.fetch.mockResolvedValue(jsonResponse({}))
    await api.get('/users/', { params: { role: 'teacher', page: 2, q: '' } })
    const [url] = global.fetch.mock.calls[0]
    expect(url).toContain('role=teacher')
    expect(url).toContain('page=2')
    expect(url).not.toContain('q=')
  })

  it('appends params to a path that already has a query string', async () => {
    const { api } = await freshApi()
    global.fetch.mockResolvedValue(jsonResponse({}))
    await api.get('/users/?active=1', { params: { role: 'admin' } })
    const [url] = global.fetch.mock.calls[0]
    expect(url).toContain('active=1')
    expect(url).toContain('role=admin')
  })
})

describe('CSRF handling', () => {
  it('sends X-CSRFToken on unsafe methods', async () => {
    const { api } = await freshApi()
    global.fetch.mockResolvedValue(jsonResponse({}))
    await api.post('/users/', { username: 'x' })
    // The last call is the POST itself; earlier ones are the CSRF probe.
    const [, init] = global.fetch.mock.calls.at(-1)
    expect(init.headers['X-CSRFToken']).toBe('test-csrf-token')
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('does not send X-CSRFToken on GET', async () => {
    const { api } = await freshApi()
    global.fetch.mockResolvedValue(jsonResponse({}))
    await api.get('/users/')
    const [, init] = global.fetch.mock.calls[0]
    expect(init.headers['X-CSRFToken']).toBeUndefined()
  })

  it('always includes the session cookie', async () => {
    const { api } = await freshApi()
    global.fetch.mockResolvedValue(jsonResponse({}))
    await api.get('/users/')
    expect(global.fetch.mock.calls[0][1].credentials).toBe('include')
  })
})

describe('error handling', () => {
  it('surfaces a DRF detail message with its status', async () => {
    const { api } = await freshApi()
    global.fetch.mockResolvedValue(
      jsonResponse({ detail: 'Not found.' }, { status: 404 })
    )
    await expect(api.get('/nope/')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Not found.',
    })
  })

  it('flattens per-field validation errors into one readable message', async () => {
    const { api } = await freshApi()
    global.fetch.mockResolvedValue(
      jsonResponse(
        { lrn: ['This field is required.'], section: ['Choose a section.'] },
        { status: 400 }
      )
    )
    await expect(api.post('/users/', {})).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('lrn:'),
    })
  })

  it('keeps the raw payload on .details so forms can map it', async () => {
    const { api, ApiError } = await freshApi()
    const payload = { username: ['Already taken.'] }
    global.fetch.mockResolvedValue(jsonResponse(payload, { status: 400 }))
    const err = await api.post('/users/', {}).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.details).toEqual(payload)
  })

  it('turns a network failure into an actionable ApiError', async () => {
    const { api, ApiError } = await freshApi()
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const err = await api.get('/users/').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(0)
    expect(err.message).toMatch(/Django is running/)
  })

  it('re-throws AbortError untouched so callers can ignore it', async () => {
    const { api } = await freshApi()
    const abort = new DOMException('aborted', 'AbortError')
    global.fetch.mockRejectedValue(abort)
    await expect(api.get('/users/')).rejects.toBe(abort)
  })
})

describe('responses', () => {
  it('returns null for 204 No Content', async () => {
    const { api } = await freshApi()
    global.fetch.mockResolvedValue(jsonResponse(null, { status: 204 }))
    await expect(api.delete('/sections/1/')).resolves.toBeNull()
  })

  it('returns parsed JSON', async () => {
    const { api } = await freshApi()
    global.fetch.mockResolvedValue(jsonResponse({ id: 1, name: 'Ada' }))
    await expect(api.get('/users/1/')).resolves.toEqual({ id: 1, name: 'Ada' })
  })

  it('sends the JSON stringified body', async () => {
    const { api } = await freshApi()
    global.fetch.mockResolvedValue(jsonResponse({}))
    await api.patch('/users/1/', { is_active: false })
    const [, init] = global.fetch.mock.calls.at(-1)
    expect(init.body).toBe(JSON.stringify({ is_active: false }))
    expect(init.method).toBe('PATCH')
  })
})

describe('list (DRF pagination)', () => {
  it('returns a plain array when the endpoint is unpaginated', async () => {
    const { api } = await freshApi()
    global.fetch.mockResolvedValue(jsonResponse([{ id: 1 }, { id: 2 }]))
    await expect(api.list('/sections/')).resolves.toHaveLength(2)
  })

  it('unwraps a single paginated page', async () => {
    const { api } = await freshApi()
    global.fetch.mockResolvedValue(
      jsonResponse({ results: [{ id: 1 }], next: null })
    )
    await expect(api.list('/users/')).resolves.toEqual([{ id: 1 }])
  })

  it('follows `next` across pages and concatenates the results', async () => {
    const { api } = await freshApi()
    global.fetch
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 1 }], next: '/api/users/?page=2' })
      )
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 2 }], next: null })
      )
    await expect(api.list('/users/')).resolves.toEqual([{ id: 1 }, { id: 2 }])
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('caps pagination at 10 pages instead of looping forever', async () => {
    const { api } = await freshApi()
    // Every page claims there is another one.
    global.fetch.mockImplementation(async (url) =>
      jsonResponse({
        results: [{ id: url }],
        next: `/api/users/?page=${Math.random()}`,
      })
    )
    const rows = await api.list('/users/')
    expect(rows).toHaveLength(10)
    expect(global.fetch).toHaveBeenCalledTimes(10)
  })
})

describe('auth helpers', () => {
  it('login posts credentials to the auth endpoint', async () => {
    const { api } = await freshApi()
    global.fetch.mockResolvedValue(jsonResponse({ user: { id: 1 } }))
    await api.login('admin', 'secret')
    const [url, init] = global.fetch.mock.calls.at(-1)
    expect(url).toBe(`${API_BASE}/auth/login/`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      username: 'admin',
      password: 'secret',
    })
  })

  it('me() issues a GET to /auth/me/', async () => {
    const { api } = await freshApi()
    global.fetch.mockResolvedValue(jsonResponse({ id: 1 }))
    await api.me()
    expect(global.fetch.mock.calls[0][0]).toBe(`${API_BASE}/auth/me/`)
  })

  it('ensureCsrf only hits the server once', async () => {
    const { api } = await freshApi()
    global.fetch.mockResolvedValue(jsonResponse({}))
    await api.ensureCsrf()
    await api.ensureCsrf()
    await api.post('/x/', {})
    // Two calls total: the CSRF probe plus the POST.
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})
