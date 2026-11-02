import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'

/**
 * Totals the server already knows.
 *
 * A summary card that counts rows the browser happens to have loaded is wrong
 * the moment a teacher has more than one page of sessions — which is the normal
 * case for a term. Each query here is a `page_size=1` read of one filtered
 * slice, so the number printed is the database's `count`, and the four cards
 * refresh together after a save.
 *
 * `queries` is an array of `{ id, path, params }` and is compared by value;
 * callers should memoize it so a re-render does not re-request.
 */
export default function useServerCounts(queries, { enabled = true, refreshKey = 0 } = {}) {
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(Boolean(enabled))
  const [error, setError] = useState(null)
  const [nonce, setNonce] = useState(0)
  const abortRef = useRef(null)
  const queriesKey = JSON.stringify(queries || null)

  useEffect(() => {
    if (!enabled || !queries || queries.length === 0) {
      setLoading(false)
      return undefined
    }
    const controller = new AbortController()
    abortRef.current = controller
    let active = true

    setLoading(true)
    setError(null)

    Promise.all(
      queries.map(async ({ id, path, params }) => {
        const page = await api.paged(path, {
          params: { page: 1, page_size: 1, ...params },
          signal: controller.signal,
        })
        return [id, page.count]
      })
    )
      .then((pairs) => {
        if (!active) return
        setCounts(Object.fromEntries(pairs))
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
  }, [queriesKey, enabled, refreshKey, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { counts, loading, error, reload }
}
