import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../services/api'
import useServerCounts from './useServerCounts'

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, default: { paged: vi.fn(), get: vi.fn(), list: vi.fn() } }
})

beforeEach(() => {
  vi.clearAllMocks()
})

/** Count reads answer with a total and one throwaway row. */
function countPage(count) {
  return {
    rows: count > 0 ? [{ id: 1 }] : [],
    count,
    page: 1,
    pageSize: 1,
    totalPages: Math.max(1, count),
    next: null,
    previous: null,
  }
}

const QUERIES = [
  { id: 'todayCount', path: '/attendance/sessions/', params: { date: '2026-11-02' } },
  { id: 'completedCount', path: '/attendance/sessions/', params: { status: 'completed' } },
  { id: 'studentCount', path: '/students/', params: { section: 4 } },
]

describe('useServerCounts', () => {
  it('reads every figure as a count, not as rows in the browser', async () => {
    api.paged.mockImplementation(async (path, { params } = {}) => {
      if (params.date) return countPage(3)
      if (params.status === 'completed') return countPage(148)
      return countPage(41)
    })

    const { result } = renderHook(() => useServerCounts(QUERIES))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.counts).toEqual({
      todayCount: 3,
      completedCount: 148,
      studentCount: 41,
    })
    // Three reads, one per figure, each asked for a single row.
    expect(api.paged).toHaveBeenCalledTimes(3)
    api.paged.mock.calls.forEach(([, options]) => {
      expect(options.params.page_size).toBe(1)
    })
  })

  it('keeps the filters of each figure when it asks', async () => {
    api.paged.mockImplementation(async () => countPage(0))
    renderHook(() => useServerCounts(QUERIES))
    await waitFor(() => expect(api.paged).toHaveBeenCalledTimes(3))

    const params = api.paged.mock.calls.map(([, options]) => options.params)
    expect(params).toContainEqual({ page: 1, page_size: 1, date: '2026-11-02' })
    expect(params).toContainEqual({ page: 1, page_size: 1, status: 'completed' })
    expect(params).toContainEqual({ page: 1, page_size: 1, section: 4 })
  })

  it('re-reads the same figures when refreshKey changes', async () => {
    api.paged.mockImplementation(async () => countPage(7))
    const { rerender } = renderHook(({ refreshKey }) => useServerCounts(QUERIES, { refreshKey }), {
      initialProps: { refreshKey: 0 },
    })

    await waitFor(() => expect(api.paged).toHaveBeenCalledTimes(3))
    rerender({ refreshKey: 1 })
    await waitFor(() => expect(api.paged).toHaveBeenCalledTimes(6))
  })

  it('does not re-read when only the object identity changed', async () => {
    api.paged.mockImplementation(async () => countPage(1))
    const { rerender } = renderHook(
      ({ queries }) => useServerCounts(queries),
      { initialProps: { queries: QUERIES.map((q) => ({ ...q })) } }
    )

    await waitFor(() => expect(api.paged).toHaveBeenCalledTimes(3))
    rerender({ queries: QUERIES.map((q) => ({ ...q })) })
    rerender({ queries: QUERIES.map((q) => ({ ...q })) })
    expect(api.paged).toHaveBeenCalledTimes(3)
  })

  it('reports a failure and retries on reload', async () => {
    let attempt = 0
    api.paged.mockImplementation(async () => {
      attempt += 1
      if (attempt <= 3) throw new Error('Cannot reach the TRACK server.')
      return countPage(2)
    })

    const { result } = renderHook(() => useServerCounts(QUERIES))
    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.counts).toEqual({})

    attempt = 100
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.counts.todayCount).toBe(2))
    expect(result.current.error).toBeNull()
  })

  it('stays idle with no queries', async () => {
    api.paged.mockImplementation(async () => countPage(1))
    const { result } = renderHook(() => useServerCounts([]))
    expect(api.paged).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  })
})
