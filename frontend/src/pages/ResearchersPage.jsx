import { useEffect, useRef } from 'react'
import Icon from '../components/Icon'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'


/* Self-hosted campus photograph; the navy wash above it carries the text contrast. */
const HERO_BG_URL = '/campus-hero.jpg';

/* Standing illustrations used beside each name — not photographs of these two
   people, so the markup treats them as decorative (alt="") and the name in the
   text is the only identity claim the page makes. */
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
                      alt=""
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
      <PublicFooter />
    </div>
  )
}
