import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import './loading.css'

/**
 * Keeps the sidebar and topbar mounted while the destination page swaps in,
 * and gives the arriving content a single short settle instead of a hard pop.
 *
 * The settle is driven by the Web Animations API on the wrapper itself rather
 * than by a `key` on the children — re-keying would remount the page and
 * re-run its data fetches on every navigation. Nothing is remounted here.
 *
 * Six pixels of rise travel with the fade because a page that only dims in
 * reads as a repaint; the small vertical cue is what says "this is the new
 * view, the shell stayed put".
 *
 * Users who prefer reduced motion, and browsers without `Element.animate`,
 * simply get the new page with no transition at all.
 */
export default function RouteTransition({ children }) {
  const ref = useRef(null)
  const location = useLocation()
  const previousPath = useRef(location.pathname)

  useLayoutEffect(() => {
    if (previousPath.current === location.pathname) return undefined
    previousPath.current = location.pathname

    const el = ref.current
    if (!el || typeof el.animate !== 'function') return undefined
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return undefined
    }

    const animation = el.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 200, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' }
    )
    return () => animation.cancel()
  }, [location.pathname])

  return (
    <div className="route-view" ref={ref}>
      {children}
    </div>
  )
}
