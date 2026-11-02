import Modal from './Modal'
import Button from './Button'

/**
 * The app's own answer to `window.confirm`.
 *
 * A native dialog cannot be styled, is read by assistive tech out of the
 * page's context, and leads with a browser origin line — which is exactly the
 * impression this product needs to avoid when an administrator is about to
 * delete something. This keeps the same yes/no contract: one labelled
 * question, a cancel that changes nothing, and a verb on the action button.
 *
 * `tone="danger"` is the default because every call site guards a write that
 * is hard to undo; a neutral confirmation (making a school year active) passes
 * `tone="primary"`.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  detail,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      width={460}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="confirm-message">{message}</p>
      {detail && <p className="confirm-detail">{detail}</p>}
    </Modal>
  )
}
