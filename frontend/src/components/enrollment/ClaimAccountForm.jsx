import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ButtonLoader } from '../loading'
import Button from '../Button'
import ConsentCheckbox from './ConsentCheckbox'
import Icon from '../Icon'
import api from '../../services/api'

/** Server field name → the state key a message is shown under. */
const GUARDIAN_FIELD = {
  username: 'username',
  password: 'password',
  guardian_username: 'guardianUsername',
  guardian_password: 'guardianPassword',
}

/** State key → the id its error span carries, so a field always points at a
 *  message that exists. */
const ERROR_ANCHOR = {
  username: 'claim-username-err',
  password: 'claim-password-err',
  confirmPassword: 'claim-confirm-password-err',
  guardianUsername: 'claim-guardian-username-err',
  guardianPassword: 'claim-guardian-password-err',
  guardianConfirm: 'claim-guardian-confirm-err',
  consent: 'claim-consent-err',
}

/**
 * "Create your account" form for an enrolled student whose one-time claim
 * credential is still unconsumed.
 *
 * Two surfaces render it: the application page reached by the emailed link
 * (public, no account yet) and the same application opened from the tracking
 * page. Both hand the token in and both sign the new student in on success,
 * because POST /enrollment/claim-account/ answers with a real auth token —
 * there is no second login after claiming.
 *
 * `guardian` is what the claim lookup knows about the adult who filed the
 * application. When there is a name to put on an account and no account
 * already holding it, the family may set that one up in the same breath —
 * one link, both accounts, because the link is the only credential they get.
 */
export default function ClaimAccountForm({
  claimToken,
  redirectTo = '/student/enrollment',
  guardian = null,
  learnerName = '',
}) {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [consent, setConsent] = useState(false)
  const [withGuardian, setWithGuardian] = useState(false)
  const [guardianUsername, setGuardianUsername] = useState('')
  const [guardianPassword, setGuardianPassword] = useState('')
  const [guardianConfirm, setGuardianConfirm] = useState('')

  const guardianName = (guardian && guardian.name) || ''
  const showGuardian = Boolean(guardianName) && !(guardian && guardian.accountExists)
  const learnerFirstName = learnerName.trim().split(/\s+/)[0] || 'the learner'

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    const errors = {}
    if (!username.trim()) errors.username = 'Choose a username.'
    if (!password) errors.password = 'Choose a password.'
    else if (confirmPassword !== password) {
      errors.confirmPassword = 'The two passwords do not match.'
    }
    if (!consent) {
      errors.consent =
        'Confirm that you have read the Privacy Notice before the account can be created.'
    }
    if (showGuardian && withGuardian) {
      if (!guardianUsername.trim()) errors.guardianUsername = 'Choose a username.'
      if (!guardianPassword) errors.guardianPassword = 'Choose a password.'
      else if (guardianConfirm !== guardianPassword) {
        errors.guardianConfirm = 'The two passwords do not match.'
      }
    }
    setFieldErrors(errors)
    setFormError(null)
    if (Object.keys(errors).length > 0) return

    setBusy(true)
    try {
      await api.claimAccount({
        claim_token: claimToken,
        username: username.trim(),
        password,
        consent: true,
        ...(showGuardian && withGuardian
          ? {
              guardian_username: guardianUsername.trim(),
              guardian_password: guardianPassword,
            }
          : {}),
      })
      await refreshUser()
      navigate(redirectTo)
    } catch (err) {
      // DRF may return per-field errors ({username: [...]} / {password: [...]}).
      const mapped = {}
      if (err && err.details && typeof err.details === 'object') {
        for (const key of ['username', 'password', 'guardian_username', 'guardian_password']) {
          if (err.details[key]) {
            mapped[GUARDIAN_FIELD[key]] = Array.isArray(err.details[key])
              ? err.details[key].join(' ')
              : String(err.details[key])
          }
        }
      }
      setFieldErrors(mapped)
      setFormError(Object.keys(mapped).length > 0 ? null : err.message)
    } finally {
      setBusy(false)
    }
  }

  function fieldError(name) {
    return fieldErrors[name] ? (
      <span className="field-error" id={ERROR_ANCHOR[name]}>
        <Icon name="info" size={13} />
        {fieldErrors[name]}
      </span>
    ) : null
  }

  return (
    <section className="card card-pad stack stack-sm" aria-labelledby="claim-heading">
      <h2 id="claim-heading" className="enr-form-title">
        Create your account
      </h2>
      <p className="subtle" style={{ margin: 0 }}>
        Your enrollment is confirmed. Set up the TRACK account you will use from
        now on — it replaces the reference number you used to track this
        application.
      </p>

      {formError && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={16} />
          <span className="grow">{formError}</span>
        </div>
      )}

      <form className="stack stack-sm" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="claim-username">Username</label>
          <input
            id="claim-username"
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={busy}
            autoComplete="username"
            aria-invalid={fieldErrors.username ? 'true' : undefined}
            aria-describedby={fieldErrors.username ? 'claim-username-err' : undefined}
          />
          {fieldError('username')}
        </div>

        <div className="row row-wrap">
          <div className="field grow">
            <label htmlFor="claim-password">Password</label>
            <input
              id="claim-password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              autoComplete="new-password"
              aria-invalid={fieldErrors.password ? 'true' : undefined}
              aria-describedby={fieldErrors.password ? 'claim-password-err' : undefined}
            />
            {fieldError('password')}
          </div>
          <div className="field grow">
            <label htmlFor="claim-confirm-password">Confirm password</label>
            <input
              id="claim-confirm-password"
              className="input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={busy}
              autoComplete="new-password"
              aria-invalid={fieldErrors.confirmPassword ? 'true' : undefined}
              aria-describedby={
                fieldErrors.confirmPassword ? 'claim-confirm-password-err' : undefined
              }
            />
            {fieldError('confirmPassword')}
          </div>
        </div>

        {showGuardian && (
          <fieldset className="claim-guardian">
            <legend className="enr-form-title">Guardian account</legend>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={withGuardian}
                onChange={(e) => setWithGuardian(e.target.checked)}
                disabled={busy}
              />
              <span>
                Also set up an account for{' '}
                {guardian.relationship
                  ? `${guardian.relationship.toLowerCase()} ${guardianName}`
                  : guardianName}
                .
              </span>
            </label>
            <p className="subtle" style={{ margin: 0 }}>
              This one is optional. It opens the parent side of TRACK — fees,
              requirements, attendance and messages for {learnerFirstName} —
              and uses this same link, so choose a username the adult will
              remember. Skip it and the Registrar can add the account later.
            </p>

            {withGuardian && (
              <>
                <div className="field">
                  <label htmlFor="claim-guardian-username">Guardian username</label>
                  <input
                    id="claim-guardian-username"
                    className="input"
                    value={guardianUsername}
                    onChange={(e) => setGuardianUsername(e.target.value)}
                    disabled={busy}
                    autoComplete="off"
                    aria-invalid={fieldErrors.guardianUsername ? 'true' : undefined}
                    aria-describedby={
                      fieldErrors.guardianUsername ? 'claim-guardian-username-err' : undefined
                    }
                  />
                  {fieldError('guardianUsername')}
                </div>
                <div className="row row-wrap">
                  <div className="field grow">
                    <label htmlFor="claim-guardian-password">Guardian password</label>
                    <input
                      id="claim-guardian-password"
                      className="input"
                      type="password"
                      value={guardianPassword}
                      onChange={(e) => setGuardianPassword(e.target.value)}
                      disabled={busy}
                      autoComplete="new-password"
                      aria-invalid={fieldErrors.guardianPassword ? 'true' : undefined}
                      aria-describedby={
                        fieldErrors.guardianPassword ? 'claim-guardian-password-err' : undefined
                      }
                    />
                    {fieldError('guardianPassword')}
                  </div>
                  <div className="field grow">
                    <label htmlFor="claim-guardian-confirm">Confirm guardian password</label>
                    <input
                      id="claim-guardian-confirm"
                      className="input"
                      type="password"
                      value={guardianConfirm}
                      onChange={(e) => setGuardianConfirm(e.target.value)}
                      disabled={busy}
                      autoComplete="new-password"
                      aria-invalid={fieldErrors.guardianConfirm ? 'true' : undefined}
                      aria-describedby={
                        fieldErrors.guardianConfirm ? 'claim-guardian-confirm-err' : undefined
                      }
                    />
                    {fieldError('guardianConfirm')}
                  </div>
                </div>
              </>
            )}
          </fieldset>
        )}

        <div className="stack stack-xs">
          <ConsentCheckbox
            checked={consent}
            onChange={setConsent}
            disabled={busy}
            purpose="and agree that the school may create this account and keep the learner's records in TRACK."
          />
          {fieldError('consent')}
        </div>

        <div className="row row-end row-wrap">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy && <ButtonLoader />}
            {busy ? 'Creating account…' : 'Create account'}
          </Button>
        </div>
      </form>
    </section>
  )
}
