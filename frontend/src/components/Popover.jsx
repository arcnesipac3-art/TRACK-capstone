import { useEffect, useRef, useState } from 'react'
import useFocusTrap from '../hooks/useFocusTrap'
import usePresence from '../hooks/usePresence'

/**
 * Trigger button plus a floating panel that closes on an outside click, on
 * Escape, or when the panel itself asks for it.
 *
 * `children` may be a function receiving `{ close }` — a menu item that
 * navigates has to close the panel on its way out.
 *
 * The panel holds the tree for the length of its exit keyframe (see
 * `usePresence`); a popover that only ever appears is half of the gesture.
 */
export default function Popover({
  trigger,
  triggerClassName = '',
  triggerLabel,
  wrapClassName = 'popover-wrap',
  panelClassName = 'popover',
  panelRole = 'dialog',
  panelLabel,
  children,
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const panelRef = useRef(null)
  const { mounted, exiting } = usePresence(open, 130)

  useFocusTrap(panelRef, { active: open, onEscape: () => setOpen(false) })

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div className={wrapClassName} ref={wrapRef}>
      <button
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel}
        aria-expanded={open}
        aria-haspopup={panelRole === 'menu' ? 'true' : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>

      {mounted && (
        <div
          ref={panelRef}
          className={exiting ? `${panelClassName} popover-exiting` : panelClassName}
          role={panelRole}
          aria-label={panelLabel}
          inert={exiting || undefined}
        >
          {typeof children === 'function' ? children({ close: () => setOpen(false) }) : children}
        </div>
      )}
    </div>
  )
}
