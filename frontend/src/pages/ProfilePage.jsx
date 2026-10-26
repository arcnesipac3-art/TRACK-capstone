import ButtonLoader from '../components/loading/ButtonLoader'
import { useState } from 'react'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import { roleLabel } from '../utils/format'

function ChangePasswordForm() {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!oldPassword || !newPassword) {
      setError('Enter your current and new password.')
      return
    }
    if (newPassword.length < 8) {
      setError('The new password must be at least 8 characters long.')
      return
    }
    if (newPassword !== confirm) {
      setError('The new passwords do not match.')
      return
    }

    setBusy(true)
    try {
      await api.post('/auth/change-password/', {
        old_password: oldPassword,
        new_password: newPassword,
      })
      setSuccess('Password updated. Use it the next time you sign in.')
      setOldPassword('')
      setNewPassword('')
      setConfirm('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack stack-sm" onSubmit={submit} noValidate>
      {error && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={16} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="alert alert-info" role="status">
          <Icon name="check" size={16} />
          <span>{success}</span>
        </div>
      )}

      <div className="field">
        <label htmlFor="old-password">Current password</label>
        <input
          id="old-password"
          className="input"
          type={show ? 'text' : 'password'}
          autoComplete="current-password"
          value={oldPassword}
          onChange={(event) => setOldPassword(event.target.value)}
          disabled={busy}
        />
      </div>

      <div className="field">
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          className="input"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          disabled={busy}
        />
      </div>

      <div className="field">
        <label htmlFor="confirm-password">Confirm new password</label>
        <input
          id="confirm-password"
          className="input"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          disabled={busy}
        />
      </div>

      <div className="row row-between row-wrap">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={show}
            onChange={(event) => setShow(event.target.checked)}
          />
          Show passwords
        </label>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy && <ButtonLoader />}
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </div>
    </form>
  )
}

export default function ProfilePage() {
  const { user } = useAuth()

  const fields = [
    ['Full name', user.fullName],
    ['Username', user.username],
    ['Email', user.email || '—'],
    ['Role', roleLabel(user.role)],
    ['Account status', user.isActive ? 'Active' : 'Inactive'],
  ]

  return (
    <div className="stack stack-md">
      <PageHeader
        title="My profile"
        subtitle="Your TRACK account as it is stored on the server."
        actions={
          <StatusBadge label={roleLabel(user.role)} tone="blue" />
        }
      />

      <section className="card card-pad">
        <dl className="profile-grid">
          {fields.map(([label, value]) => (
            <div className="profile-field" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="subtle" style={{ marginTop: 14 }}>
          Ask the school administrator to update your name, email or role.
        </p>
      </section>

      <section className="card">
        <header className="card-header">
          <h2>Change password</h2>
        </header>
        <div className="card-body">
          <ChangePasswordForm />
        </div>
      </section>
    </div>
  )
}
