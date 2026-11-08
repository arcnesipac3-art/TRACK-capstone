import { useEffect, useRef } from 'react'
import Icon from '../components/Icon'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'


/* Self-hosted campus photograph; the navy wash above it carries the text contrast. */
const HERO_BG_URL = '/campus-hero.jpg';

const VALUES = [
  { icon: 'clock',  label: 'Efficiency',         desc: 'Cuts manual record-keeping so teachers spend more time teaching.' },
  { icon: 'eye',    label: 'Transparency',        desc: 'Parents and students get real-time visibility into requirements, attendance, and fees.' },
  { icon: 'shield', label: 'Data Responsibility', desc: 'Student records are scoped strictly by role. No account can read another person\'s data.' },
]

const CAPABILITIES = [
  { icon: 'clipboard',   title: 'Requirements Tracking',  desc: 'Post deadlines, submit work, and track verification status  all in one list.' },
  { icon: 'checkSquare', title: 'Attendance Monitoring',  desc: 'Teachers record attendance per session; advisers and admins get the school-wide roll-up.' },
  { icon: 'megaphone',   title: 'School Communication',   desc: 'Announcements and notifications reach the right audience  staff, students, or parents.' },
]

export default function AboutPage() {
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

        <section className="ap-hero" aria-labelledby="ap-heading">
          <div className="ap-hero-inner">
            <p className="ap-eyebrow">About the Project</p>
            <h1 id="ap-heading">
              A simpler way to manage{' '}
              <span className="ap-heading-accent">school requirements.</span>
            </h1>
            <p className="ap-lede">
              TRACK coordinates requirements, attendance, and school
              communication for Kiwalan National High School  giving
              administrators, teachers, students, and parents one shared
              view of everything that matters.
            </p>
            <div className="ap-badges" aria-label="Project highlights">
              <span className="ap-badge">Built for KNHS</span>
              <span className="ap-badge">Student-led research</span>
              <span className="ap-badge">School-focused</span>
            </div>
          </div>
        </section>

        <section className="ap-section" aria-labelledby="ap-why-heading">
          <div className="ap-container">
            <div className="ap-section-header">
              <h2 id="ap-why-heading">Why TRACK exists</h2>
              <p className="ap-section-sub">
                Schools lose hours every week to scattered group chats, paper
                forms, and missed deadlines. TRACK puts everything in one place.
              </p>
            </div>
            <div className="ap-cards">
              <article className="ap-card">
                <div className="ap-card-icon" aria-hidden="true"><Icon name="chart" size={22} /></div>
                <h3>Our Mission</h3>
                <p>Streamline the administrative work that pulls educators away from teaching. By centralising requirement tracking, attendance recording, and parent communication, TRACK lets KNHS staff focus on what they came to do.</p>
                <p>Built as a research thesis project, TRACK is a concrete step toward better school technology in the Philippine public education system  starting with Kiwalan National High School.</p>
              </article>
              <article className="ap-card">
                <div className="ap-card-icon" aria-hidden="true"><Icon name="shield" size={22} /></div>
                <h3>Core Values</h3>
                <ul className="ap-values">
                  {VALUES.map((v) => (
                    <li key={v.label} className="ap-value-row">
                      <div className="ap-value-dot" aria-hidden="true"><Icon name={v.icon} size={14} /></div>
                      <div className="ap-value-body"><strong>{v.label}</strong><span>{v.desc}</span></div>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="ap-caps" aria-labelledby="ap-caps-heading">
          <div className="ap-container">
            <h2 id="ap-caps-heading" className="ap-caps-heading">What TRACK does</h2>
            <div className="ap-caps-grid">
              {CAPABILITIES.map((cap, i) => (
                <div className="ap-cap" key={cap.title}>
                  {i > 0 && <div className="ap-cap-div" aria-hidden="true" />}
                  <div className="ap-cap-icon" aria-hidden="true"><Icon name={cap.icon} size={20} /></div>
                  <div className="ap-cap-body"><strong>{cap.title}</strong><span>{cap.desc}</span></div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>
      <PublicFooter />
    </div>
  )
}