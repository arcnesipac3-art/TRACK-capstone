import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import PublicNav from '../components/PublicNav'
import { useAuth } from '../context/AuthContext'
import { dashboardPath } from '../utils/format'

const SITE_YEAR = new Date().getFullYear()

/* School-campus backdrop — fits the "research team" context without using
   AI-generated thesis images. Loaded lazily after first paint. */
const HERO_BG_URL =
  'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1920&q=80'

const RESEARCHERS = [
  {
    photo: '/student2.webp',
    name: 'Arc Aaron R. Capisen',
    role: 'Lead Developer',
    tone: 'lead',
    bio: 'Designed and built the TRACK web application — its interfaces, the API behind them, and the system the school runs it on.',
    focus: ['Web development', 'System design', 'Deployment'],
  },
  {
    photo: '/student.png',
    name: 'Ameroden L. Sarip',
    role: 'Partner Researcher',
    tone: 'partner',
    bio: 'Partner researcher on the TRACK research thesis study at Kiwalan National High School, Iligan City.',
    focus: ['Research design', 'Data gathering', 'Evaluation'],
  },
]

export default function ResearchersPage() {
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
    img.onload = () => { if (!cancelled) root.classList.add('bg-ready') }
    img.src = HERO_BG_URL
    return () => { cancelled = true; img.onload = null }
  }, [])

  return (
    <div className="res-page" ref={pageRef}>
      <PublicNav />

      <main className="res-main">

        {/* ── Hero ── */}
        <section className="rp-hero" aria-labelledby="rp-heading">
          <div className="rp-hero-inner">
            <p className="rp-eyebrow">Meet the Team</p>
            <h1 id="rp-heading">The people behind TRACK.</h1>
            <p className="rp-lede">
              A student-led research project built to help KNHS monitor
              requirements, attendance, and school communication.
            </p>
            <div className="rp-location-badge" aria-label="Location">
              <Icon name="mapPin" size={13} aria-hidden="true" />
              KNHS · Iligan City, Philippines
            </div>
          </div>
        </section>

        {/* ── Researchers ── */}
        <section className="rp-team" aria-labelledby="rp-team-heading">
          <div className="rp-container">

            <div className="rp-team-header">
              <h2 id="rp-team-heading">Meet the researchers</h2>
              <p className="rp-team-sub">
                Two students from Kiwalan National High School who researched,
                designed, and built TRACK from the ground up.
              </p>
            </div>

            <div className="rp-grid">
              {RESEARCHERS.map((person) => (
                <article
                  className={`rp-card rp-card--${person.tone}`}
                  key={person.name}
                >
                  {/* Portrait */}
                  <div className="rp-portrait-wrap">
                    <img
                      src={person.photo}
                      alt={`Portrait of ${person.name}`}
                      className="rp-portrait-img"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>

                  {/* Body */}
                  <div className="rp-card-body">
                    <p className="rp-role">{person.role}</p>
                    <h3 className="rp-name">{person.name}</h3>
                    <p className="rp-bio">{person.bio}</p>
                    <ul className="rp-tags" aria-label="Skills">
                      {person.focus.map((item) => (
                        <li key={item} className="rp-tag">{item}</li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>

          </div>
        </section>

      </main>

      {/* ── Footer ── */}
      <footer className="landing-foot">
        <div className="landing-foot-inner">
          <div className="foot-brand">
            <Link className="foot-logo-btn" to="/" aria-label="TRACK — home">
              <img src="/knhs-seal.png" alt="KNHS seal" className="foot-knhs-seal" />
              <Logo variant="light" />
            </Link>
            <p className="foot-tagline">
              Tracking Requirements, Attendance &amp; Communication for
              Kiwalan National High School.
            </p>
            <p className="foot-dept">Purok 10 Mato-og, Kiwalan, Iligan City, Philippines</p>
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
            <p className="foot-col-title">About Us</p>
            <Link to="/about">About TRACK</Link>
            <Link to="/location">Location</Link>
            <Link to="/researchers">Researchers</Link>
            <Link to="/terms">Terms &amp; Conditions</Link>
            <Link to="/privacy">Privacy Policy</Link>
          </nav>
        </div>

        <div className="foot-bottom">
          <p>© {SITE_YEAR} Arc Aaron R. Capisen &amp; Ameroden L. Sarip · TRACK</p>
          <p>Purok 10 Mato-og, Kiwalan, Iligan City, Philippines</p>
        </div>
      </footer>
    </div>
  )
}
