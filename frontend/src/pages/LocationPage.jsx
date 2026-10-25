import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import PublicNav from '../components/PublicNav'
import { useAuth } from '../context/AuthContext'
import { dashboardPath } from '../utils/format'

const SITE_YEAR = new Date().getFullYear()

const HERO_BG_URL =
  'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1920&q=80'

const HIGHLIGHTS = [
  { icon: 'mapPin',    label: 'Strategic Location',  desc: 'Situated along the main road in Kiwalan, easily reached by public transport.' },
  { icon: 'building',  label: 'Modern Facilities',   desc: 'Well-equipped classrooms and dedicated learning spaces.' },
  { icon: 'users',     label: 'Community Hub',        desc: 'A center for educational and community activities in Kiwalan.' },
  { icon: 'shield',    label: 'Safe Environment',     desc: 'Secure campus with dedicated security personnel.' },
  { icon: 'book',      label: 'Academic Excellence',  desc: 'Committed to quality education and student success.' },
  { icon: 'gradCap',   label: 'Student Development',  desc: 'Programs for holistic growth and character building.' },
]

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
    img.onload = () => { if (!cancelled) root.classList.add('bg-ready') }
    img.src = HERO_BG_URL
    return () => { cancelled = true; img.onload = null }
  }, [])

  return (
    <div className="res-page" ref={pageRef}>
      <PublicNav />

      <main className="res-main">

        {/* Hero */}
        <section className="loc-hero" aria-labelledby="loc-heading">
          <div className="loc-hero-inner">
            <p className="loc-eyebrow">Our Location</p>
            <h1 id="loc-heading">Visit Kiwalan National High School.</h1>
            <p className="loc-lede">
              Located in Kiwalan, Iligan City  accessible by public transport
              and serving the local community as a centre of education.
            </p>
          </div>
        </section>

        {/* Body */}
        <div className="loc-body">
          <div className="loc-container">

            {/* Address + Getting here */}
            <div className="loc-info-row">

              <div className="loc-card">
                <div className="loc-card-icon" aria-hidden="true">
                  <Icon name="mapPin" size={20} />
                </div>
                <h2>Address</h2>
                <div className="loc-address">
                  <strong>Kiwalan National High School</strong>
                  <p>Purok 10 Mato-og</p>
                  <p>Kiwalan, Iligan City</p>
                  <p>Lanao del Norte, Philippines 9200</p>
                </div>
                <h3>Contact</h3>
                <p>
                  For inquiries, visit the school registrar&rsquo;s office during school
                  hours or contact the administration through official channels.
                </p>
              </div>

              <div className="loc-card">
                <div className="loc-card-icon" aria-hidden="true">
                  <Icon name="send" size={20} />
                </div>
                <h2>Getting Here</h2>
                <p>
                  The school is accessible via public transportation from Iligan
                  City proper. Jeepneys and tricycles regularly ply the route to
                  Kiwalan.
                </p>
                <p>
                  The campus sits along the main road, making it straightforward
                  to find for first-time visitors.
                </p>
              </div>

            </div>

            {/* Campus highlights */}
            <div className="loc-highlights">
              <h2>Campus Highlights</h2>
              <div className="loc-highlights-grid">
                {HIGHLIGHTS.map((h) => (
                  <div className="loc-highlight" key={h.label}>
                    <div className="loc-hl-icon" aria-hidden="true">
                      <Icon name={h.icon} size={16} />
                    </div>
                    <div className="loc-hl-body">
                      <strong>{h.label}</strong>
                      <span>{h.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Map */}
            <div id="map" className="loc-map-wrap">
              <div className="loc-map-header">
                <div className="loc-card-icon" style={{ margin: 0 }} aria-hidden="true">
                  <Icon name="mapPin" size={18} />
                </div>
                <h2>Interactive Map</h2>
              </div>
              <div className="loc-map-iframe-wrap">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3948.2282345024582!2d124.27128261130186!3d8.280069091719959!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x325576cc580e692d%3A0x1ee65da2c86ad0a6!2sKiwalan%20National%20High%20School!5e0!3m2!1sen!2sus!4v1792935788645!5m2!1sen!2sus"
                  width="100%"
                  height="400"
                  style={{ border: 0 }}
                  allowFullScreen=""
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  title="Kiwalan National High School Location"
                />
              </div>
              <p className="loc-map-note">
                Search &ldquo;Kiwalan National High School&rdquo; in Google Maps or your preferred
                navigation app for turn-by-turn directions.
              </p>
            </div>

          </div>
        </div>

      </main>

      {/* Footer */}
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
          <p>&copy; {SITE_YEAR} TRACK &middot; Purok 10 Mato-og, Kiwalan, Iligan City, Philippines</p>
          <p>Accounts are issued and controlled by the school registrar.</p>
        </div>
      </footer>
    </div>
  )
}