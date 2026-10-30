import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ButtonLoader } from '../../components/loading'
import Icon from '../../components/Icon'
import PageHeader from '../../components/PageHeader'
import api from '../../services/api'
import './EnrollmentPages.css'

/**
 * Public application tracking (/enroll/track). Matches the reference number
 * against the guardian email or any contact number typed on the application;
 * a hit stores the guest credential and opens the applicant's own view of
 * the application — still without an account.
 */
export default function PublicTrackPage() {
  const navigate = useNavigate()
  const [reference, setReference] = useState('')
  const [contact, setContact] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const errors = {}
    if (!reference.trim()) errors.reference = 'Enter your application reference.'
    if (!contact.trim()) errors.contact = 'Enter the guardian email or contact number.'
    setFieldErrors(errors)
    setFormError(null)
    if (Object.keys(errors).length > 0) return

    setBusy(true)
    try {
      const result = await api.trackApplication({
        reference: reference.trim(),
        contact: contact.trim(),
      })
      // api.trackApplication stores the returned guest token; the applicant
      // can now open their own application straight away.
      navigate(`/enroll/applications/${result.application_id}`)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function fieldError(name) {
    return fieldErrors[name] ? (
      <span className="field-error" id={`track-${name}-err`}>
        <Icon name="info" size={13} />
        {fieldErrors[name]}
      </span>
    ) : null
  }

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Track my application"
        subtitle="Enter the reference number from your application together with the
          guardian email or any contact number you wrote on it. No account is
          needed."
      />

      <form className="card card-pad stack stack-sm" onSubmit={handleSubmit} noValidate>
        {formError && (
          <div className="alert alert-error" role="alert">
            <Icon name="info" size={16} />
            <span className="grow">{formError}</span>
          </div>
        )}

        <div className="field">
          <label htmlFor="track-reference">Application reference</label>
          <input
            id="track-reference"
            className="input"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            disabled={busy}
            placeholder="e.g. APP-1234567890"
            aria-invalid={fieldErrors.reference ? 'true' : undefined}
            aria-describedby={fieldErrors.reference ? 'track-reference-err' : undefined}
          />
          {fieldError('reference')}
        </div>

        <div className="field">
          <label htmlFor="track-contact">Guardian email or contact number</label>
          <input
            id="track-contact"
            className="input"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            disabled={busy}
            placeholder="e.g. parent@example.com or 0917 123 4567"
            aria-invalid={fieldErrors.contact ? 'true' : undefined}
            aria-describedby={fieldErrors.contact ? 'track-contact-err' : undefined}
          />
          {fieldError('contact')}
          <span className="hint">
            Use exactly what was written on the application — both entries must
            match.
          </span>
        </div>

        <div className="row row-between row-wrap">
          <Link className="btn btn-ghost btn-sm" to="/enroll">
            Back
          </Link>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && <ButtonLoader />}
            {busy ? 'Tracking…' : 'Track my application'}
          </button>
        </div>
      </form>

      <p className="subtle text-center">
        Want to apply first? <Link to="/enroll/apply">Start an application</Link>
      </p>
    </div>
  )
}
