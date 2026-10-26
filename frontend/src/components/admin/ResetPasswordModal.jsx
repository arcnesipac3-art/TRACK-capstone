import ButtonLoader from '../../components/loading/ButtonLoader'
import { useState } from 'react'
import Icon from '../Icon'
import Modal from '../Modal'
import api from '../../services/api'

/** Matches Django's MinimumLengthValidator so the common case fails fast. */
const MIN_LENGTH = 8

/**
 * The API calls this field `new_password`; the form calls it `password`.
 * Without this, a server-side validation error is stored under a key the
 * fields never read, and the message is silently dropped on the floor.
 */
const SERVER_FIELD_ALIASES = { new_password: 'password' }

/** Inline field error; hoisted so it is not remounted on every render. */
function FieldError({ id, message }) {
  if (!message) return null
  return (
    <span className="field-error" id={id}>
      <Icon name="info" size={13} />
      {message}
    </span>
  )
}

/**
 * Admin: set a new password on another account.
 *
 * This is the registrar's recovery path — TRACK has no self-service email
 * reset because the deployment has no SMTP. The password is write-only: it is
 * posted once and never stored or echoed back.
 */
export default function ResetPasswordModal({ open, user, onClose, onDone }) {
  const name = user?.full_name || user?.username || 'this account'

  const [form, setForm] = useState({ password: '', confirm: '' })
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  // No account to reset — render nothing rather than a dialog aimed at nobody.
  if (!user) return null

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    // Clear the stale error for the field being edited.
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  function validate() {
    const errors = {}
    if (!form.password) {
      errors.password = 'Enter a new password.'
    } else if (form.password.length < MIN_LENGTH) {
      errors.password = `Use at least ${MIN_LENGTH} characters.`
    } else if (/^\d+$/.test(form.password)) {
      errors.password = 'A password cannot be only numbers.'
    }
    if (form.confirm !== form.password) {
      errors.confirm = 'The two passwords do not match.'
    }
    return errors
  }

  async function submit(event) {
    event.preventDefault()
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setBusy(true)
    setError(null)
    try {
      const res = await api.post('/auth/reset-password/', {
        user_id: user.id,
        new_password: form.password,
      })
      setDone(true)
      onDone?.(res?.message)
    } catch (err) {
      if (err.details && typeof err.details === 'object') {
        const mapped = {}
        Object.entries(err.details).forEach(([key, value]) => {
          const message = Array.isArray(value) ? value.join(' ') : String(value)
          // Translate API field names onto the names the inputs use.
          mapped[SERVER_FIELD_ALIASES[key] || key] = message
        })
        setFieldErrors(mapped)
      }
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function fieldProps(name) {
    return {
      id: `rp-${name}`,
      className: 'input',
      'aria-invalid': fieldErrors[name] ? 'true' : undefined,
      'aria-describedby': fieldErrors[name] ? `rp-${name}-err` : undefined,
    }
  }

  const errorFor = (name) => (
    <FieldError id={`rp-${name}-err`} message={fieldErrors[name]} />
  )

  /** Success state: the password is gone, so never re-render the form. */
  if (done) {
    return (
      <Modal
        open={open}
        title="Password reset"
        onClose={onClose}
        width={520}
        footer={
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            Done
          </button>
        }
      >
        <div className="stack stack-sm">
          <div className="alert alert-success" role="status">
            <Icon name="check" size={17} />
            <span>The password for {name} has been changed.</span>
          </div>
          <p className="subtle">
            Their old password no longer works, and any other device they were
            signed in on has been signed out. Give them the new password over a
            channel you trust, then ask them to change it after they sign in.
          </p>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      title={`Reset password for ${name}`}
      onClose={onClose}
      dismissible={!busy}
      width={520}
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="reset-password-form"
            className="btn btn-primary btn-sm"
            disabled={busy}
          >
            {busy && <ButtonLoader />}
            {busy ? 'Resetting…' : 'Reset password'}
          </button>
        </>
      }
    >
      <form id="reset-password-form" className="stack stack-sm" onSubmit={submit} noValidate>
        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="info" size={16} />
            <span>{error}</span>
          </div>
        )}

        <p className="subtle">
          This replaces the current password for{' '}
          <strong>{user?.username}</strong>. Their old password stops working
          immediately, and every other signed-in session for this account is
          signed out.
        </p>

        <div className="field">
          <label htmlFor="rp-password">New password</label>
          <input
            {...fieldProps('password')}
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            disabled={busy}
          />
          {errorFor('password')}
        </div>

        <div className="field">
          <label htmlFor="rp-confirm">Confirm new password</label>
          <input
            {...fieldProps('confirm')}
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={(e) => update('confirm', e.target.value)}
            disabled={busy}
          />
          {errorFor('confirm')}
        </div>

        <p className="subtle">
          At least {MIN_LENGTH} characters, not only numbers, and not built from
          the account holder's own name.
        </p>
      </form>
    </Modal>
  )
}
