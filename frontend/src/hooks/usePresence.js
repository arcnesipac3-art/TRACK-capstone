import { useEffect, useState } from 'react'

/**
 * Whether a leaving node has anywhere to leave from.
 *
 * jsdom has no `Element.animate`, and these surfaces are asserted on right
 * after a close in tests; a user who asked for reduced motion should not have
 * the dialog hang around for a frame they cannot see. Where nothing can be
 * seen moving, the node goes in the same commit that closed it.
 */
function willAnimateAway() {
  if (typeof window === 'undefined') return false
  if (typeof window.HTMLElement !== 'function') return false
  if (typeof window.HTMLElement.prototype.animate !== 'function') return false
  return !(
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Keeps a node in the tree for `duration` ms after `open` turns false, so the
 * exit keyframe has somewhere to run.
 *
 * Every floating surface in the app used to leave the moment its `open` prop
 * went false — a dialog that plays a 160ms entrance and then vanishes in one
 * frame reads as a glitch, and the eye loses the cue about where it went. The
 * pair returned here drives both halves: `mounted` decides whether the node is
 * rendered at all, and `exiting` selects the `-out` class while it leaves.
 *
 * The unmount is timed rather than driven by `animationend`, because a CSS
 * animation that never starts (element not yet painted, background tab) would
 * otherwise leave the node mounted with its focus trap already off.
 */
export default function usePresence(open, duration = 180) {
  const [mounted, setMounted] = useState(open)

  // Opening is synchronous: a node that appeared a commit late would miss the
  // first frames of its own entrance.
  if (open && !mounted) setMounted(true)
  // Closing is synchronous only where no animation can run.
  if (!open && mounted && !willAnimateAway()) setMounted(false)

  useEffect(() => {
    if (open || !mounted || !willAnimateAway()) return undefined
    const timer = window.setTimeout(() => setMounted(false), duration)
    return () => window.clearTimeout(timer)
  }, [open, mounted, duration])

  return { mounted, exiting: mounted && !open }
}
