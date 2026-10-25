import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import PublicNav from '../components/PublicNav'
import { useAuth } from '../context/AuthContext'
import { dashboardPath } from '../utils/format'

const SITE_YEAR = new Date().getFullYear()

/* Research-flavoured backdrop for the hero band — bound thesis papers and
   research manuscripts rather than the campus exterior, so the band reads as
   scholarship before a word of the copy is read. Kept here (not in the
   stylesheet) so the URL can be handed to the browser *after* first paint,
   keeping the image off this route's critical path. */
const HERO_BG_URL =
  'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=Cinematic%20wide%20photograph%20of%20a%20stack%20of%20bound%20thesis%20papers%20and%20research%20manuscripts%20on%20a%20desk%2C%20printed%20pages%20showing%20charts%2C%20tables%20and%20citations%2C%20spiral-bound%20research%20papers%2C%20warm%20directional%20light%2C%20shallow%20depth%20of%20field%2C%20scholarly%20atmosphere&image_size=landscape_16_9'

/* The two researchers behind TRACK, in the order they are credited. Each keeps
   the KNHS student artwork already used elsewhere in the app — student2.webp
   (the bust crop) for the developer, student.png (the full-body plate) for the
   partner researcher. */
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

  // Lazy-load the hero's campus backdrop: the band paints its flat navy first,
  // the URL is handed over only after mount, and `bg-ready` fades the photo in
  // once it has decoded — so it never sits on the route's critical path.
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
      <PublicNav />

      <main className="res-main">
        {/* ── Hero ──────────────────────────────────────────────── */}
        <section className="res-hero" aria-labelledby="res-heading">
          <div className="res-hero-inner">
            <p className="res-eyebrow">Research Thesis Team</p>
            <h1 id="res-heading">The researchers behind TRACK.</h1>
            <p className="res-lede">
              TRACK is a research thesis project for Kiwalan National High School, Iligan City —
              researched and built by two students.
            </p>
          </div>
        </section>

        {/* ── Team ──────────────────────────────────────────────── */}
        <section className="res-team" aria-label="Researchers">
          <div className="res-container">
            <div className="res-team-grid">
              {RESEARCHERS.map((person) => (
                <article className={`res-card res-card--${person.tone}`} key={person.name}>
                  <div className="res-portrait">
                    <span className="res-portrait-glow" aria-hidden="true" />
                    <img
                      src={person.photo}
                      alt={`Portrait of ${person.name}`}
                      className="res-portrait-img"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <div className="res-card-body">
                    <p className="res-role">{person.role}</p>
                    <h2 className="res-name">{person.name}</h2>
                    <p className="res-bio">{person.bio}</p>
                    <ul className="res-focus">
                      {person.focus.map((item) => (
                        <li key={item}>
                          <span className="res-mark" aria-hidden="true">
                            <Icon name="check" size={11} />
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────── */}
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
            <p className="foot-dept">
              Purok 10 Mato-og, Kiwalan, Iligan City, Philippines
            </p>
          </div>

          {/* Site — mirrors the landing footer, with the section links routed
              back through "/" so they scroll the landing page. */}
          <nav className="foot-col" aria-label="Site sections">
            <p className="foot-col-title">Site</p>
            <Link to="/">Home</Link>
            <Link to="/#problem">The Problem</Link>
            <Link to="/#features">Features</Link>
            <Link to="/#how-it-works">How it Works</Link>
            <Link to="/#roles">Who it&rsquo;s for</Link>
            <Link to="/#faq">FAQ</Link>
          </nav>

          {/* Account */}
          <nav className="foot-col" aria-label="Account links">
            <p className="foot-col-title">Account</p>
            <Link to={dashboardHref}>{signedIn ? 'Open dashboard' : 'Sign in to TRACK'}</Link>
            <Link to="/#faq">How to get an account</Link>
            <Link to="/#security">Data &amp; Privacy</Link>
          </nav>

          {/* About us column — matching the eGovPH footer structure */}
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
          <p>© {SITE_YEAR} Arc Aaron R. Capisen &amp; Ameroden L. Sarip · TRACK</p>
          <p>Purok 10 Mato-og, Kiwalan, Iligan City, Philippines</p>
        </div>
      </footer>
    </div>
  )
}
