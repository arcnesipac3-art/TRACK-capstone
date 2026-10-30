import { useEffect, useRef } from 'react'
import Icon from './Icon'

/**
 * Accessible dialog used by the admin management screens.
 *
 * - Escape and the backdrop both close it (unless `dismissible={false}`
 *   while a request is in flight),
 * - focus moves into the dialog on open and returns to the opener on close,
 * - `aria-modal` + a labelled heading for screen readers.
 */
export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  dismissible = true,
  width = 560,
}) {
  const panelRef = useRef(null)
  const previouslyFocused = useRef(null)
  // Read through refs so the open/close effect runs only when `open` changes.
  // Depending on the `onClose`/`dismissible` identities would re-run it on
  // every parent render — re-focusing the dialog mid-typing and stealing the
  // caret out of whatever the user is writing.
  const onCloseRef = useRef(onClose)
  const dismissibleRef = useRef(dismissible)

  useEffect(() => {
    onCloseRef.current = onClose
    dismissibleRef.current = dismissible
  })

  useEffect(() => {
    if (!open) return undefined

    previouslyFocused.current = document.activeElement
    const panel = panelRef.current
    // Land on the first control inside the body (the thing the dialog is
    // about), not on the Close button: a screen reader should announce the
    // content, and focus must not sit on a button that a stray Space press
    // would activate.
    const firstField =
      panel?.querySelector(
        '.modal-body input:not([type="hidden"]), .modal-body select, .modal-body textarea, .modal-body button, .modal-footer button'
      ) || panel
    firstField?.focus()

    function onKeyDown(event) {
      if (event.key === 'Escape' && dismissibleRef.current) {
        event.stopPropagation()
        onCloseRef.current?.()
        return
      }
      // Keep Tab inside the dialog while it is open.
      if (event.key !== 'Tab' || !panel) return
      const focusable = [
        ...panel.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ),
      ].filter((el) => el.offsetParent !== null)
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
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="modal-backdrop" onMouseDown={() => dismissible && onClose?.()}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panelRef}
        style={{ maxWidth: width }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          {dismissible && (
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <Icon name="close" size={18} />
            </button>
          )}
        </header>

        <div className="modal-body">{children}</div>

        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  )
}
