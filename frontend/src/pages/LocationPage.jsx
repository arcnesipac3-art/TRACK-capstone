import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import PublicNav from '../components/PublicNav'
import { useAuth } from '../context/AuthContext'
import { dashboardPath } from '../utils/format'

const SITE_YEAR = new Date().getFullYear()

/* School location-themed backdrop for the Location page hero. */
const HERO_BG_URL =
  'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1920&q=80'

export default function LocationPage() {
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
      <PublicNav />

      <main className="res-main">
        {/* ── Hero ──────────────────────────────────────────────── */}
        <section className="res-hero" aria-labelledby="location-heading">
          <div className="res-hero-inner">
            <p className="res-eyebrow">Our Location</p>
            <h1 id="location-heading">Visit Kiwalan National High School.</h1>
            <p className="res-lede">
              Located in the heart of Kiwalan, Iligan City, our campus serves as a
              beacon of education for the community.
            </p>
          </div>
        </section>

        {/* ── Content ───────────────────────────────────────────── */}
        <section className="res-content-section">
          <div className="res-container">
            <div className="res-grid">
              <div className="res-text-block">
                <h2>Address & Contact</h2>
                <div className="address-block">
                  <strong>Kiwalan National High School</strong>
                  <p>Purok 10 Mato-og</p>
                  <p>Kiwalan, Iligan City</p>
                  <p>Lanao del Norte, Philippines</p>
                  <p>9200</p>
                </div>
                <h3>Getting Here</h3>
                <p>
                  The school is accessible via public transportation from Iligan City
                  proper. Jeepneys and tricycles regularly ply the route to Kiwalan.
                  The campus is located along the main road, making it easy to find
                  for visitors and students alike.
                </p>
                <h3>Contact Information</h3>
                <p>
                  For inquiries and concerns, please visit the school registrar's office
                  during school hours or contact the administration through official channels.
                </p>
              </div>
              <div className="res-feature-list">
                <h3>Campus Highlights</h3>
                <div className="res-features-container">
                  <div className="res-feature-row">
                    <div className="res-feature-item">
                      <span className="res-mark"><Icon name="mapPin" size={14} /></span>
                      <strong>Strategic Location:</strong>
                    </div>
                    <div className="res-feature-desc">
                      Situated in Kiwalan, serving the local community.
                    </div>
                  </div>
                  <div className="res-feature-row">
                    <div className="res-feature-item">
                      <span className="res-mark"><Icon name="building" size={14} /></span>
                      <strong>Modern Facilities:</strong>
                    </div>
                    <div className="res-feature-desc">
                      Well-equipped classrooms and learning spaces.
                    </div>
                  </div>
                  <div className="res-feature-row">
                    <div className="res-feature-item">
                      <span className="res-mark"><Icon name="trees" size={14} /></span>
                      <strong>Green Environment:</strong>
                    </div>
                    <div className="res-feature-desc">
                      Surrounded by natural beauty for a conducive learning atmosphere.
                    </div>
                  </div>
                  <div className="res-feature-row">
                    <div className="res-feature-item">
                      <span className="res-mark"><Icon name="users" size={14} /></span>
                      <strong>Community Hub:</strong>
                    </div>
                    <div className="res-feature-desc">
                      A center for educational and community activities.
                    </div>
                  </div>
                  <div className="res-feature-row">
                    <div className="res-feature-item">
                      <span className="res-mark"><Icon name="shield" size={14} /></span>
                      <strong>Safe Environment:</strong>
                    </div>
                    <div className="res-feature-desc">
                      Secure campus with dedicated security personnel.
                    </div>
                  </div>
                  <div className="res-feature-row">
                    <div className="res-feature-item">
                      <span className="res-mark"><Icon name="book" size={14} /></span>
                      <strong>Academic Excellence:</strong>
                    </div>
                    <div className="res-feature-desc">
                      Committed to providing quality education for student success.
                    </div>
                  </div>
                  <div className="res-feature-row">
                    <div className="res-feature-item">
                      <span className="res-mark"><Icon name="gradCap" size={14} /></span>
                      <strong>Student Development:</strong>
                    </div>
                    <div className="res-feature-desc">
                      Programs focused on holistic growth and character building.
                    </div>
                  </div>
                  <div className="res-feature-row">
                    <div className="res-feature-item">
                      <span className="res-mark"><Icon name="activity" size={14} /></span>
                      <strong>Active Learning:</strong>
                    </div>
                    <div className="res-feature-desc">
                      Engaging methodologies that inspire critical thinking.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Map Section ────────────────────────────────────── */}
            <div id="map" className="res-map-section">
              <h2>Interactive Map</h2>
              <div className="res-map-container">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3948.2282345024582!2d124.27128261130186!3d8.280069091719959!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x325576cc580e692d%3A0x1ee65da2c86ad0a6!2sKiwalan%20National%20High%20School!5e0!3m2!1sen!2sus!4v1792935788645!5m2!1sen!2sus"
                  width="100%"
                  height="400"
                  style={{ border: 0 }}
                  allowFullScreen=""
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  title="Kiwalan National High School Location"
                ></iframe>
              </div>
              <p className="res-map-note">
                Note: For the most accurate directions, search "Kiwalan National High School"
                in Google Maps or your preferred navigation app.
              </p>
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
