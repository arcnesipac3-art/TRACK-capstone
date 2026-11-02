import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../services/api'
import useServerList from './useServerList'

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, default: { paged: vi.fn(), get: vi.fn(), list: vi.fn() } }
})

/** A DRF-shaped page, wrapped the way `api.paged` wraps it. */
function page(rows, count, params = {}) {
  return {
    rows,
    count,
    page: Number(params.page) || 1,
    pageSize: Number(params.page_size) || rows.length || 1,
    totalPages: Math.max(1, Math.ceil(count / (Number(params.page_size) || rows.length || 1))),
    next: null,
    previous: null,
  }
}

function mockPage(resolver) {
  api.paged.mockImplementation(async (path, { params } = {}) => resolver(path, params || {}))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useServerList', () => {
  it('holds exactly the page the server returned', async () => {
    mockPage(() => page([{ id: 3 }, { id: 4 }], 412, { page: 2, page_size: 20 }))
    const { result } = renderHook(() =>
      useServerList('/attendance/sessions/', { params: { page: 2, page_size: 20 } })
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rows).toEqual([{ id: 3 }, { id: 4 }])
    expect(result.current.count).toBe(412)
    expect(result.current.totalPages).toBe(21)
    // One request, not a crawl: the screen never holds more rows than it shows.
    expect(api.paged).toHaveBeenCalledTimes(1)
  })

  it('asks for the params it was given', async () => {
    mockPage(() => page([], 0))
    renderHook(() =>
      useServerList('/attendance/sessions/', {
        params: { brief: 1, date: '2026-11-02', status: 'outstanding' },
      })
    )
    await waitFor(() => expect(api.paged).toHaveBeenCalled())
    expect(api.paged).toHaveBeenCalledWith(
      '/attendance/sessions/',
      expect.objectContaining({
        params: { brief: 1, date: '2026-11-02', status: 'outstanding' },
      })
    )
  })

  it('re-requests when a filter changes and replaces the rows', async () => {
    mockPage((path, params) =>
      page([{ id: params.date === '2026-11-02' ? 1 : 2 }], 1, params)
    )
    const { result, rerender } = renderHook(({ params }) =>
      useServerList('/attendance/sessions/', { params })
    , { initialProps: { params: { date: '2026-11-01' } } })

    await waitFor(() => expect(result.current.rows).toEqual([{ id: 2 }]))

    rerender({ params: { date: '2026-11-02' } })
    await waitFor(() => expect(result.current.rows).toEqual([{ id: 1 }]))
    expect(api.paged).toHaveBeenCalledTimes(2)
  })

  it('compares params by value, so a new object each render is not a new request', async () => {
    mockPage(() => page([{ id: 1 }], 1))
    const { rerender } = renderHook(() =>
      useServerList('/attendance/records/', { params: { student: 101, page: 1 } })
    )
    await waitFor(() => expect(api.paged).toHaveBeenCalledTimes(1))
    rerender()
    rerender()
    expect(api.paged).toHaveBeenCalledTimes(1)
  })

  it('refreshKey re-reads the same page without changing the params', async () => {
    mockPage(() => page([{ id: 1 }], 1))
    const { rerender } = renderHook(({ refreshKey }) =>
      useServerList('/attendance/sessions/', { params: { page: 1 }, refreshKey })
    , { initialProps: { refreshKey: 0 } })

    await waitFor(() => expect(api.paged).toHaveBeenCalledTimes(1))
    rerender({ refreshKey: 1 })
    await waitFor(() => expect(api.paged).toHaveBeenCalledTimes(2))
    expect(api.paged.mock.calls[1][1].params).toEqual({ page: 1 })
  })

  it('stays silent while disabled', async () => {
    mockPage(() => page([{ id: 1 }], 1))
    const { result } = renderHook(() =>
      useServerList('/students/', { params: { search: 'mar' }, enabled: false })
    )
    expect(api.paged).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
    expect(result.current.rows).toEqual([])
  })

  it('reports a failed read and retries on reload', async () => {
    let attempt = 0
    api.paged.mockImplementation(async () => {
      attempt += 1
      if (attempt === 1) {
        const err = new Error('Cannot reach the TRACK server.')
        throw err
      }
      return page([{ id: 1 }], 1)
    })
    const { result } = renderHook(() => useServerList('/attendance/sessions/', { params: {} }))

    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.error.message).toBe('Cannot reach the TRACK server.')
    expect(result.current.rows).toEqual([])

    act(() => result.current.reload())
    await waitFor(() => expect(result.current.rows).toEqual([{ id: 1 }]))
    expect(result.current.error).toBeNull()
  })

  it('keeps the previous rows while the next page is on its way', async () => {
    let resolveFirst = null
    api.paged
      .mockImplementationOnce(
        () => new Promise((resolve) => { resolveFirst = () => resolve(page([{ id: 1 }], 5)) })
      )
      .mockImplementation(() => Promise.resolve(page([{ id: 2 }], 5)))

    const { result, rerender } = renderHook(({ params }) =>
      useServerList('/attendance/sessions/', { params })
    , { initialProps: { params: { page: 1 } } })

    act(() => resolveFirst())
    await waitFor(() => expect(result.current.rows).toEqual([{ id: 1 }]))

    rerender({ params: { page: 2 } })
    // Still loading, and the screen has not been emptied underneath the user.
    expect(result.current.loading).toBe(true)
    expect(result.current.rows).toEqual([{ id: 1 }])
    await waitFor(() => expect(result.current.rows).toEqual([{ id: 2 }]))
  })
})
