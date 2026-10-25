import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'

/**
 * Small data-fetching hook used by every TRACK screen.
 *
 * Returns `{ data, loading, error, reload }` and guarantees:
 *  - a loading state on first load and on explicit reloads,
 *  - an error object (with a readable message) on failure,
 *  - no state updates after unmount,
 *  - a `reload()` retry action for error states.
 *
 * `useFetch(null)` stays idle (used when a required id is missing).
 */
export default function useFetch(path, options = {}) {
  const { params, list: asList = false, enabled = true, deps = [] } = options
  const [data, setData] = useState(null)
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

    const run = asList
      ? api.list(path, { params, signal: controller.signal })
      : api.get(path, { params, signal: controller.signal })

    run
      .then((result) => {
        if (!active) return
        setData(result)
        setError(null)
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
  }, [path, paramsKey, asList, enabled, nonce, ...deps])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { data, loading, error, reload }
}
