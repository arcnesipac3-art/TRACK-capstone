import { useRef } from 'react'
import Icon from './Icon'
import useFocusTrap from '../hooks/useFocusTrap'
import usePresence from '../hooks/usePresence'

/**
 * Accessible dialog used by the admin management screens.
 *
 * - Escape and the backdrop both close it (unless `dismissible={false}`
 *   while a request is in flight),
 * - focus moves into the dialog on open and returns to the opener on close,
 * - `aria-modal` + a labelled heading for screen readers,
 * - the panel plays a short exit keyframe on the way out, so closing it is
 *   readable as the dialog leaving rather than as the page losing content.
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
  // The dialog stays painted for the length of its exit keyframe; `open` alone
  // would drop it mid-flight.
  const { mounted, exiting } = usePresence(open, 170)
  // Land on the first control inside the body (the thing the dialog is about),
  // not on the Close button: a screen reader should announce the content, and
  // focus must not sit on a button that a stray Space press would activate.
  useFocusTrap(panelRef, {
    active: open,
    lockScroll: true,
    onEscape: dismissible ? onClose : null,
    initialFocus:
      '.modal-body input:not([type="hidden"]), .modal-body select, .modal-body textarea, .modal-body button, .modal-footer button',
  })

  if (!mounted) return null

  return (
    <div
      className={exiting ? 'modal-backdrop modal-backdrop-out' : 'modal-backdrop'}
      onMouseDown={() => dismissible && onClose?.()}
    >
      <div
        className={exiting ? 'modal-panel modal-panel-out' : 'modal-panel'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panelRef}
        // Fading out but still painted: keep it out of the tab order and the
        // accessibility tree so the frames it spends leaving are silent.
        inert={exiting || undefined}
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
