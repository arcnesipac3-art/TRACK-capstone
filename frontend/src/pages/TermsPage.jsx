import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { dashboardPath } from '../utils/format'

const SITE_YEAR = new Date().getFullYear()

/* Minimal scholarly backdrop for legal pages. */
const HERO_BG_URL =
  'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=Cinematic%20wide%20photograph%20of%20a%20clean%20minimalist%20office%20setting%2C%20organized%20documents%20on%20a%20desk%2C%20soft%20morning%20light%2C%20professional%20atmosphere%2C%20neutral%20tones&image_size=landscape_16_9'

export default function TermsPage() {
  const { isAuthenticated, user } = useAuth()
  const signedIn = isAuthenticated && Boolean(user)
  const dashboardHref = signedIn ? dashboardPath(user.role) : '/login'
  const pageRef = useRef(null)

  useEffect(() => {
    const root = pageRef.current
    if (!root) return undefined
    root.style.setProperty('--res-hero-bg', `url("${HERO_BG_URL}")`)
    let cancelled = false
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      if (!cancelled) root.classList.add('bg-ready')
    }
    img.src = HERO_BG_URL
    return () => {
      cancelled = true
      img.onload = null
    }
  }, [])

  return (
    <div className="res-page" ref={pageRef}>
      <header className="res-nav">
        <Link className="res-nav-brand" to="/" aria-label="TRACK — back to home">
          <img src="/knhs-seal.png" alt="" className="res-nav-seal" />
          <Logo size="sm" />
        </Link>
        <nav className="res-nav-links" aria-label="Site sections">
          <Link to="/">Home</Link>
          <Link to="/#problem">The Problem</Link>
          <Link to="/#features">Features</Link>
          <Link to="/#how-it-works">How It Works</Link>
          <Link to="/#roles">Roles</Link>
          <Link to="/#faq">FAQ</Link>
          <Link to="/location">Find Us</Link>
        </nav>
        <Link className="btn btn-primary" to={dashboardHref}>
          {signedIn ? 'Open dashboard' : 'Sign In'}
        </Link>
      </header>

      <main className="res-main">
        <section className="res-hero" aria-labelledby="terms-heading">
          <div className="res-hero-inner">
            <p className="res-eyebrow">Legal</p>
            <h1 id="terms-heading">Terms &amp; Conditions.</h1>
            <p className="res-lede">
              Please read these terms carefully before using the TRACK School Management System.
            </p>
          </div>
        </section>

        <section className="res-content-section">
          <div className="res-container res-container--narrow">
            <div className="res-legal-text">
              <p className="res-updated">Last Updated: October 2026</p>
              
              <h2>1. Acceptance of Terms</h2>
              <p>
                By accessing and using TRACK, you agree to be bound by these Terms and 
                Conditions and all applicable laws and regulations of the Republic of the 
                Philippines.
              </p>

              <h2>2. User Accounts</h2>
              <p>
                Accounts are issued by the Kiwalan National High School registrar. Users are 
                responsible for maintaining the confidentiality of their login credentials. 
                Any unauthorized use of your account must be reported immediately to the 
                school administration.
              </p>

              <h2>3. Authorized Use</h2>
              <p>
                TRACK is intended solely for the use of KNHS students, parents, teachers, 
                and administrators. You agree not to:
              </p>
              <ul>
                <li>Use the system for any illegal or unauthorized purpose.</li>
                <li>Attempt to gain unauthorized access to other user accounts.</li>
                <li>Submit false information regarding attendance or requirements.</li>
              </ul>

              <h2>4. Termination</h2>
              <p>
                The school administration reserves the right to suspend or terminate access 
                to TRACK for any user who violates these terms or engages in conduct that 
                compromises the integrity of the school's data.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-foot">
        <div className="landing-foot-inner">
          <div className="foot-brand">
            <Link to="/" className="foot-logo-btn">
              <img src="/knhs-seal.png" alt="" className="foot-knhs-seal" />
              <Logo variant="light" />
            </Link>
            <p className="foot-tagline">
              Tracking Requirements, Attendance &amp; Communication for
              Kiwalan National High School.
            </p>
            <p className="foot-dept">
              Purok 10 Mato-og, Kiwalan, Iligan City, Philippines
            </p>
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
            <Link to={dashboardHref}>{signedIn ? 'Open dashboard' : 'Sign in to TRACK'}</Link>
            <Link to="/#faq">How to get an account</Link>
            <Link to="/#security">Data &amp; Privacy</Link>
          </nav>

          <nav className="foot-col" aria-label="About us links">
            <p className="foot-col-title">ABOUT US</p>
            <Link to="/about">About TRACK</Link>
            <Link to="/location">Location</Link>
            <Link to="/researchers">Researchers</Link>
            <Link to="/terms">Terms &amp; Conditions</Link>
            <Link to="/privacy">Privacy Policy</Link>
          </nav>
        </div>
        <div className="foot-bottom">
          <p>© {SITE_YEAR} TRACK · Purok 10 Mato-og, Kiwalan, Iligan City, Philippines</p>
          <p>Accounts are issued and controlled by the school registrar.</p>
        </div>
      </footer>
    </div>
  )
}
