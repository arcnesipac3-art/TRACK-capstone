import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Keeps Tab inside `containerRef` while a floating surface is open.
 *
 * Shared by the dialog and the popovers: each had its own copy, and the two
 * copies had already drifted apart.
 *
 * - Focus moves to the first control (or `initialFocus`) when `active` turns
 *   on, and back to whatever held it before, when it turns off.
 * - Tab wraps at both ends of the container.
 * - Escape calls `onEscape`; leaving it out means Escape does nothing.
 * - `lockScroll` freezes the page behind an overlay.
 *
 * `onEscape` is read through a ref, so a parent that recreates the callback on
 * every render cannot re-run the effect — that would re-focus the surface
 * mid-typing and steal the caret.
 */
export default function useFocusTrap(
  containerRef,
  { active = true, onEscape = null, lockScroll = false, initialFocus = null } = {}
) {
  const onEscapeRef = useRef(onEscape)

  useEffect(() => {
    onEscapeRef.current = onEscape
  })

  useEffect(() => {
    if (!active) return undefined
    const container = containerRef.current
    const previouslyFocused = document.activeElement

    const landing =
      (initialFocus && container?.querySelector(initialFocus)) ||
      container?.querySelector(FOCUSABLE) ||
      container
    landing?.focus?.()

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        if (!onEscapeRef.current) return
        event.stopPropagation()
        onEscapeRef.current()
        return
      }
      if (event.key !== 'Tab' || !container) return
      const focusable = [...container.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = lockScroll ? document.body.style.overflow : null
    if (lockScroll) document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (lockScroll) document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [containerRef, active, lockScroll, initialFocus])
}
