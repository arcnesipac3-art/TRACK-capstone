import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { dashboardPath } from '../utils/format'

const SITE_YEAR = new Date().getFullYear()

/* Research/Scholarship-flavoured backdrop for the About page hero. */
const HERO_BG_URL =
  'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=Cinematic%20wide%20photograph%20of%20a%20modern%20academic%20hallway%2C%20bright%20and%20airy%2C%20high%20ceilings%2C%20students%20collaborating%20in%20the%20background%2C%20warm%20daylight%2C%20scholarly%20atmosphere%2C%20minimalist%20architecture&image_size=landscape_16_9'

export default function AboutPage() {
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
      {/* ── Nav ───────────────────────────────────────────────────── */}
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
        </nav>
        <Link className="btn btn-primary" to="/login">
          Sign In
        </Link>
      </header>

      <main className="res-main">
        {/* ── Hero ──────────────────────────────────────────────── */}
        <section className="res-hero" aria-labelledby="about-heading">
          <div className="res-hero-inner">
            <p className="res-eyebrow">About the Project</p>
            <h1 id="about-heading">Modernizing school management for KNHS.</h1>
            <p className="res-lede">
              TRACK (Tracking Requirements, Attendance, and Communication) is an integrated 
              Student Information System designed specifically for the needs of Kiwalan 
              National High School.
            </p>
          </div>
        </section>

        {/* ── Content ───────────────────────────────────────────── */}
        <section className="res-content-section">
          <div className="res-container">
            <div className="res-grid">
              <div className="res-text-block">
                <h2>Our Mission</h2>
                <p>
                  Our goal is to streamline administrative tasks and improve the 
                  communication bridge between teachers, students, and parents. By 
                  centralizing attendance tracking and requirement submissions, we allow 
                  educators to focus more on teaching and less on paperwork.
                </p>
                <p>
                  Built as a research thesis project, TRACK represents a commitment to 
                  technological advancement in the Philippine public school system, 
                  starting with our very own Kiwalan National High School.
                </p>
              </div>
              <div className="res-feature-list">
                <h3>Core Values</h3>
                <ul>
                  <li>
                    <span className="res-mark"><Icon name="check" size={14} /></span>
                    <strong>Efficiency:</strong> Reducing manual record-keeping time by up to 60%.
                  </li>
                  <li>
                    <span className="res-mark"><Icon name="check" size={14} /></span>
                    <strong>Transparency:</strong> Real-time access to student progress for parents.
                  </li>
                  <li>
                    <span className="res-mark"><Icon name="check" size={14} /></span>
                    <strong>Security:</strong> Data protection following Philippine DepEd standards.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────── */}
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
              Kiwalan National High School · Iligan City, Philippines
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
            <Link to="/researchers">Researchers</Link>
            <Link to="/terms">Terms &amp; Conditions</Link>
            <Link to="/privacy">Privacy Policy</Link>
          </nav>
        </div>
        <div className="foot-bottom">
          <p>© {SITE_YEAR} TRACK · Kiwalan National High School · Iligan City, Philippines</p>
          <p>Accounts are issued and controlled by the school registrar.</p>
        </div>
      </footer>
    </div>
  )
}
