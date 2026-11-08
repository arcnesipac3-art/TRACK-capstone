import { Link } from 'react-router-dom'
import Logo from './Logo'
import { useAuth } from '../context/AuthContext'
import { dashboardPath } from '../utils/format'

const SITE_YEAR = new Date().getFullYear()

/* The controller identity, in one place.
 *
 * Every public surface has to say who is responsible for the personal data the
 * site collects and how to reach that party. There is no published email
 * address or telephone number for the school in this codebase, so the contact
 * route is the registrar's office at the address below — inventing an inbox
 * here would be worse than not listing one, because privacy inquiries would go
 * nowhere.
 */
const CONTROLLER = 'Kiwalan National High School · Purok 10 Mato-og, Kiwalan, Iligan City, Lanao del Norte 9200'
const CONTROLLER_NOTE = 'Data controller: the school. Accounts are issued and controlled by the school registrar; privacy inquiries are handled at the registrar’s office.'

function Columns() {
  return (
    <div className="landing-foot-inner">
      <div className="foot-brand">
        <Link to="/" className="foot-logo-btn" aria-label="TRACK — home">
          <img src="/knhs-seal.png" alt="" className="foot-knhs-seal" />
          <Logo variant="light" />
        </Link>
        <p className="foot-tagline">
          Tracking Requirements, Attendance &amp; Communication for
          Kiwalan National High School.
        </p>
        <p className="foot-dept">{CONTROLLER}</p>
      </div>

      <nav className="foot-col" aria-label="Site sections">
        <p className="foot-col-title">Site</p>
        <Link to="/">Home</Link>
        <Link to="/#problem">The Problem</Link>
        <Link to="/#features">Features</Link>
        <Link to="/#how-it-works">How it Works</Link>
        <Link to="/#roles">Who it&rsquo;s for</Link>
        <Link to="/#faq">FAQ</Link>
      </nav>

      <nav className="foot-col" aria-label="Account links">
        <p className="foot-col-title">Account</p>
        <DashboardLink />
        <Link to="/#faq">How to get an account</Link>
        <Link to="/#security">Data &amp; Privacy</Link>
      </nav>

      <nav className="foot-col" aria-label="About us links">
        <p className="foot-col-title">About Us</p>
        <Link to="/about">About TRACK</Link>
        <Link to="/location">Location</Link>
        <Link to="/researchers">Researchers</Link>
        <Link to="/terms">Terms &amp; Conditions</Link>
        <Link to="/privacy">Privacy Policy</Link>
      </nav>
    </div>
  )
}

/* The same link the page-level code used to build by hand: signed in, it is
   the dashboard for that role; signed out, it is the way in. */
function DashboardLink() {
  const { isAuthenticated, user } = useAuth()
  const signedIn = isAuthenticated && Boolean(user)
  return (
    <Link to={signedIn ? dashboardPath(user.role) : '/login'}>
      {signedIn ? 'Open dashboard' : 'Sign in to TRACK'}
    </Link>
  )
}

/**
 * Shared footer for every public surface.
 *
 * `full` — the four-column footer the marketing pages have always had.
 * `compact` — one dark band for surfaces that never had a footer at all (the
 *             public enrollment portal), where the four-column layout would
 *             swallow the form the visitor is actually here to use.
 * `strip` — the same links and the same identity statement, unstyled, for the
 *             bottom of a card. Sign-in is a fixed-height split panel with no
 *             scroll, so it cannot carry a footer; it can carry this.
 *
 * All three say who is responsible for the data and where to raise an issue.
 */
export default function PublicFooter({ variant = 'full' }) {
  if (variant === 'strip') {
    return (
      <div className="public-foot-strip">
        <nav className="pfs-links" aria-label="Legal links">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms &amp; Conditions</Link>
        </nav>
        <p className="pfs-controller">{CONTROLLER}</p>
      </div>
    )
  }

  if (variant === 'compact') {
    return (
      <footer className="public-foot-compact">
        <div className="pfc-inner">
          <Link to="/" className="foot-logo-btn" aria-label="TRACK — home">
            <img src="/knhs-seal.png" alt="" className="foot-knhs-seal" />
            <Logo variant="light" size="sm" />
          </Link>
          <nav className="pfc-links" aria-label="Legal and about links">
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms &amp; Conditions</Link>
            <Link to="/about">About TRACK</Link>
            <Link to="/location">Location</Link>
          </nav>
        </div>
        <p className="pfc-controller">{CONTROLLER}</p>
        <p className="pfc-note">{CONTROLLER_NOTE}</p>
      </footer>
    )
  }

  return (
    <footer className="landing-foot">
      <Columns />
      <div className="foot-bottom">
        <p>&copy; {SITE_YEAR} TRACK &middot; Kiwalan National High School &middot; Iligan City, Philippines</p>
        <p>{CONTROLLER_NOTE}</p>
      </div>
    </footer>
  )
}
