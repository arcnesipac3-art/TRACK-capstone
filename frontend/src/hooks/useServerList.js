import { useCallback, useEffect, useRef, useState } from 'react'
import api, { pageFrom } from '../services/api'

/**
 * One server-side page of a list.
 *
 * `useFetch(..., { list: true })` is the right tool for a small table that
 * renders everything and sorts in the browser — it walks up to ten pages and
 * returns a flat array. An attendance history is not that: the database already
 * filtered, sorted and counted, and the total is what the page controls render.
 * This hook asks for one page and keeps the count, the page number and the
 * page size, so a screen never holds more rows than it shows.
 *
 * `params` is compared by value, so callers can build it inline. Changing it
 * re-requests page one (pass `page` inside `params` when you want otherwise).
 *
 * `refreshKey` re-requests the same page whenever the value changes — a parent
 * that just wrote to the list can bump it without remounting the screen and
 * losing the filters the user set.
 */
export default function useServerList(path, options = {}) {
  const { params, enabled = true, refreshKey = 0 } = options
  const [page, setPage] = useState(() => pageFrom(null, params || {}))
  const [loading, setLoading] = useState(Boolean(enabled && path))
  const [error, setError] = useState(null)
  const [nonce, setNonce] = useState(0)
  const abortRef = useRef(null)
  const paramsKey = JSON.stringify(params || null)

  useEffect(() => {
    if (!enabled || !path) {
      setLoading(false)
      return undefined
    }
    const controller = new AbortController()
    abortRef.current = controller
    let active = true
    setLoading(true)
    setError(null)

    api
      .paged(path, { params, signal: controller.signal })
      .then((result) => {
        if (!active) return
        setPage(result)
      })
      .catch((err) => {
        if (!active || err.name === 'AbortError') return
        setError(err)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, paramsKey, enabled, refreshKey, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return {
    rows: page.rows,
    count: page.count,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages,
    next: page.next,
    loading,
    error,
    reload,
  }
}
