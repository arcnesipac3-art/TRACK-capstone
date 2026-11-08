import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'

/**
 * Walk a server list one recorded date at a time.
 *
 * The history screens show a single day, so "the previous day" cannot be the
 * calendar's previous day — a school calendar is mostly weekends, holidays and
 * days a teacher simply did not take a register, and a stepper that stops on
 * each of them spends the trip showing nothing. Instead the caller supplies
 * `probesFor(day)`, three `page_size: 1` reads built by the pure helpers in
 * `utils/attendance.js`, and this hook turns them into the date on screen plus
 * the two dates that can be reached from it.
 *
 * `landing` picks the first day whenever the filters change (a new search is a
 * new walk), and it deliberately ignores `refreshKey`: a save elsewhere on the
 * page should refresh the walk without yanking the user to the newest day they
 * were not looking at.
 *
 * Every request is aborted and every result is guarded by an `active` flag, the
 * same way `useServerList` does it, because a fast double-press on the arrow
 * must never let an older probe answer for a newer day.
 *
 * `dateOf` reads the day off a probe row. Lists differ — a session row is
 * dated, a mark carries its date inside `session_detail` — and guessing would
 * make one of the two walks silently never move.
 */
export default function useRecordedDay(path, { probesFor, dateOf = (row) => row?.date, enabled = true, refreshKey = 0 }) {
  const [day, setDay] = useState(null)
  const [neighbours, setNeighbours] = useState({ earlier: null, later: null })
  const [landing, setLanding] = useState(null)
  const [landed, setLanded] = useState(false)
  const [walking, setWalking] = useState(false)
  const [error, setError] = useState(null)
  const [nonce, setNonce] = useState(0)

  const probes = enabled && path ? probesFor(day) : null
  const landingKey = probes ? JSON.stringify(probes.landing) : null
  const walkKey = probes && day ? JSON.stringify([probes.earlier, probes.later]) : null

  // Which day the walk starts on, from the filters alone.
  useEffect(() => {
    if (!enabled || !path || !landingKey) return undefined
    const controller = new AbortController()
    let active = true
    setLanded(false)
    api
      .paged(path, { params: probes.landing, signal: controller.signal })
      .then((page) => {
        if (!active) return
        const first = dateOf(page.rows[0]) ?? null
        setLanding(first)
        setDay(first)
        setError(null)
      })
      .catch((err) => {
        if (!active || err.name === 'AbortError') return
        setError(err)
      })
      .finally(() => {
        if (active) setLanded(true)
      })
    return () => {
      active = false
      controller.abort()
    }
    // `probes` is rebuilt each render; the serialised landing params are its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, landingKey, enabled, nonce])

  // The two dates reachable from the one on screen.
  useEffect(() => {
    if (!enabled || !path || !day || !walkKey) {
      // A filter that leaves no day behind aborts the probes started for the
      // day being replaced, and an aborted chain never reaches its `finally`.
      // Clearing the flag here is what stops the screen sitting on a skeleton
      // for a walk that is no longer running.
      setWalking(false)
      return undefined
    }
    const controller = new AbortController()
    let active = true
    setWalking(true)
    Promise.all([
      api.paged(path, { params: probes.earlier, signal: controller.signal }),
      api.paged(path, { params: probes.later, signal: controller.signal }),
    ])
      .then(([before, after]) => {
        if (!active) return
        setNeighbours({
          earlier: dateOf(before.rows[0]) ?? null,
          later: dateOf(after.rows[0]) ?? null,
        })
      })
      .catch((err) => {
        if (!active || err.name === 'AbortError') return
        setError(err)
      })
      .finally(() => {
        if (active) setWalking(false)
      })
    return () => {
      active = false
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, day, walkKey, enabled, refreshKey, nonce])

  const go = useCallback(
    (direction) => {
      const target = neighbours[direction]
      if (!target) return false
      setDay(target)
      return true
    },
    [neighbours],
  )

  const jumpToLanding = useCallback(() => {
    if (landing) setDay(landing)
  }, [landing])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return {
    day,
    neighbours,
    /** The day the walk started on — newest, or oldest when sorted that way. */
    landing,
    /** False until the landing probe has answered, empty or not. */
    landed,
    /** True while the two reachability probes are in flight. */
    walking,
    error,
    go,
    jumpToLanding,
    reload,
  }
}
