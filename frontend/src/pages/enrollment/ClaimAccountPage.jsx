import { Link, useSearchParams } from 'react-router-dom'
import ClaimAccountForm from '../../components/enrollment/ClaimAccountForm'
import Icon from '../../components/Icon'
import PageHeader from '../../components/PageHeader'
import { PageLoader } from '../../components/loading'
import useFetch from '../../hooks/useFetch'
import './EnrollmentPages.css'

/**
 * The page the confirmation email's link opens (/enroll/claim?token=…).
 *
 * The visitor arrives with nothing but a one-time credential — no account, no
 * guest token, no reference — so the screen first asks the claim endpoint what
 * that token belongs to, says whose enrollment it is, and only then offers the
 * form. Every other answer the endpoint can give (an unknown, spent, or
 * not-yet-confirmed token) is shown as its own state instead of a blank form
 * that would fail on submit.
 */
export default function ClaimAccountPage() {
  const [query] = useSearchParams()
  const token = (query.get('token') || '').trim()
  const lookup = useFetch('/enrollment/claim-account/', {
    params: { token },
    enabled: Boolean(token),
  })

  if (!token) {
    return (
      <div className="stack stack-md">
        <PageHeader
          title="Account setup"
          subtitle="This link is incomplete — it carries no account setup credential."
        />
        <div className="card card-pad stack stack-sm">
          <p style={{ margin: 0 }}>
            Open the whole link from the confirmation email, or find the
            application by its reference number instead.
          </p>
          <div className="row row-wrap gap-sm">
            <Link className="btn btn-primary btn-sm" to="/enroll/track">
              Track my application
            </Link>
            <Link className="btn btn-ghost btn-sm" to="/login">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (lookup.loading && lookup.data === null) return <PageLoader label="Checking the link…" />

  if (lookup.error) {
    return (
      <div className="stack stack-md">
        <PageHeader title="Account setup" subtitle="This link could not be checked." />
        <div className="card card-pad stack stack-sm">
          <div className="alert alert-error" role="alert">
            <Icon name="info" size={16} />
            <span className="grow">{lookup.error.message}</span>
          </div>
          <p className="subtle" style={{ margin: 0 }}>
            The setup link is written once per enrollment. If it has already
            been used, or it does not belong to this school's records, track the
            application by its reference number or ask the Registrar to resend
            it.
          </p>
          <div className="row row-wrap gap-sm">
            <Link className="btn btn-primary btn-sm" to="/enroll/track">
              Track my application
            </Link>
            <button type="button" className="btn btn-ghost btn-sm" onClick={lookup.reload}>
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  const info = lookup.data
  if (!info) return <PageLoader label="Checking the link…" />

  if (!info.claim_available) {
    return (
      <div className="stack stack-md">
        <PageHeader
          title={info.learner_name ? `Welcome, ${info.learner_name}` : 'Account setup'}
          subtitle={`Application ${info.reference} — there is no account to set up here.`}
        />
        <div className="alert alert-info" role="status">
          <Icon name="info" size={16} />
          <span className="grow">{info.detail}</span>
        </div>
        <div className="row row-wrap gap-sm">
          <Link className="btn btn-primary btn-sm" to="/login">
            Sign in
          </Link>
          <Link className="btn btn-ghost btn-sm" to="/enroll/track">
            Track my application
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Your enrollment is confirmed"
        subtitle={`Set up the TRACK account for ${info.learner_name || 'your student'}.
          The link in your email works once, so this is the moment to choose a
          username and password.`}
      />

      <section className="card">
        <header className="card-header">
          <h2>Enrollment</h2>
        </header>
        <div className="card-body">
          <dl className="enr-dl">
            <div>
              <dt>Learner</dt>
              <dd>{info.learner_name || '—'}</dd>
            </div>
            <div>
              <dt>Application reference</dt>
              <dd>{info.reference}</dd>
            </div>
          </dl>
        </div>
      </section>

      <ClaimAccountForm
        claimToken={token}
        learnerName={info.learner_name}
        guardian={{
          name: info.guardian_name,
          relationship: info.guardian_relationship,
          accountExists: info.guardian_account_exists,
        }}
      />

      <p className="subtle">
        Lost the email? You can still open this application from{' '}
        <Link to="/enroll/track">Track my application</Link>.
      </p>
    </div>
  )
}
