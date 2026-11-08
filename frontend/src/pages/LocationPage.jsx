import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'


/* Self-hosted campus photograph; the navy wash above it carries the text contrast. */
const HERO_BG_URL = '/campus-hero.jpg';

/* Held as a string, never rendered until the visitor asks for the map. */
const MAP_EMBED_URL = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3948.2282345024582!2d124.27128261130186!3d8.280069091719959!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x325576cc580e692d%3A0x1ee65da2c86ad0a6!2sKiwalan%20National%20High%20School!5e0!3m2!1sen!2sus!4v1792935788645!5m2!1sen!2sus';

const HIGHLIGHTS = [
  { icon: 'mapPin',    label: 'Strategic Location',  desc: 'Situated along the main road in Kiwalan, easily reached by public transport.' },
  { icon: 'building',  label: 'Modern Facilities',   desc: 'Well-equipped classrooms and dedicated learning spaces.' },
  { icon: 'users',     label: 'Community Hub',        desc: 'A center for educational and community activities in Kiwalan.' },
  { icon: 'shield',    label: 'Safe Environment',     desc: 'Secure campus with dedicated security personnel.' },
  { icon: 'book',      label: 'Academic Excellence',  desc: 'Committed to quality education and student success.' },
  { icon: 'gradCap',   label: 'Student Development',  desc: 'Programs for holistic growth and character building.' },
]

export default function LocationPage() {
  const pageRef = useRef(null)
  const [showMap, setShowMap] = useState(false)

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

            {/* Map — click-to-load facade.
                An embedded Google map contacts Google on page load: it sets
                Google cookies and sends the visitor's IP address to a third
                party, before that visitor asked for a map. The panel below
                makes the same content available one click later, and the
                address beside it is enough to reach the school without any
                third party seeing the visit at all. */}
            <div id="map" className="loc-map-wrap">
              <div className="loc-map-header">
                <div className="loc-card-icon" style={{ margin: 0 }} aria-hidden="true">
                  <Icon name="mapPin" size={18} />
                </div>
                <h2>Interactive Map</h2>
              </div>
              <div className="loc-map-iframe-wrap">
                {showMap ? (
                  <iframe
                    src={MAP_EMBED_URL}
                    width="100%"
                    height="400"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    title="Kiwalan National High School Location"
                  />
                ) : (
                  <div className="loc-map-facade">
                    <p className="loc-map-facade-addr">
                      Purok 10 Mato-og, Kiwalan, Iligan City, Lanao del Norte 9200
                    </p>
                    <p className="loc-map-facade-geo">8.2801° N, 124.2713° E</p>
                    <button
                      type="button"
                      className="loc-map-load"
                      onClick={() => setShowMap(true)}
                    >
                      <Icon name="mapPin" size={15} aria-hidden="true" />
                      Load the map from Google
                    </button>
                    <p className="loc-map-facade-why">
                      Loading it lets Google set its own cookies and record your
                      IP address, and tells Google you visited this page. Nothing
                      has been sent yet, and this page works fine without it —
                      the address above is all the map really says.
                    </p>
                    <a
                      className="loc-map-external"
                      href="https://www.google.com/maps/search/?api=1&amp;query=Kiwalan+National+High+School"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open in Google Maps
                    </a>
                  </div>
                )}
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
      <PublicFooter />
    </div>
  )
}