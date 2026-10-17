import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import dashboardShot from '../assets/dashboard.webp'
import { useAuth } from '../context/AuthContext'
import { dashboardPath } from '../utils/format'

const FEATURES = [
  {
    icon: 'clipboard',
    title: 'Requirements tracking',
    body: 'Every assignment, project and quiz for a class, with its deadline, in one list the whole section can see.',
  },
  {
    icon: 'calendar',
    title: 'Attendance monitoring',
    body: 'Teachers record attendance per class and per day. Advisers and administrators get the roll-up.',
  },
  {
    icon: 'users',
    title: 'Parent access',
    body: 'Guardians follow their own child\u2019s submissions and attendance, and nothing beyond it.',
  },
  {
    icon: 'megaphone',
    title: 'Announcements',
    body: 'School-wide and audience-targeted notices reach staff, students and parents where they already track their work.',
  },
]

const STEPS = [
  {
    icon: 'clipboard',
    title: 'Teachers publish requirements',
    body: 'A teacher posts the requirement for a class and sets the deadline. Every student in that section sees the same list.',
  },
  {
    icon: 'send',
    title: 'Students submit their work',
    body: 'Students upload or link their output before the deadline, and watch each item move from pending to verified.',
  },
  {
    icon: 'chart',
    title: 'Parents monitor progress',
    body: 'Parents check their child\u2019s submissions and attendance, and are notified when work is returned or a notice is posted.',
  },
]

export default function LandingPage() {
  const { isAuthenticated, user } = useAuth()
  const signedIn = isAuthenticated && Boolean(user)
  const dashboardHref = signedIn ? dashboardPath(user.role) : '/login'

  return (
    <div className="landing">
      <a className="landing-skip" href="#main-content">
        Skip to content
      </a>

      {/* Public navigation. The logo is not a link here because this is the
          page it would point at; the two in-page links and the sign-in call to
          action are the whole navigation. */}
      <header className="landing-nav">
        <Logo size="sm" />

        <nav className="landing-nav-links" aria-label="Landing sections">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
        </nav>

        <Link className="btn btn-primary" to={dashboardHref}>
          {signedIn ? 'Open dashboard' : 'Sign in'}
        </Link>
      </header>

      <main className="landing-main" id="main-content" tabIndex={-1}>
        <section className="landing-hero" aria-labelledby="hero-heading">
          <div className="landing-hero-inner">
            <span className="hero-kicker">
              <Icon name="gradCap" size={14} />
              Kiwalan National High School · Iligan City
            </span>

            <h1 id="hero-heading">
              Requirements, attendance and communication, tracked in one place.
            </h1>

            <p className="hero-sub">
              TRACK is the school management portal for Kiwalan National High
              School. Teachers publish requirements, students submit their work,
              and parents follow every deadline and school day.
            </p>

            <div className="hero-actions">
              <Link className="btn btn-primary" to={dashboardHref}>
                {signedIn ? 'Go to my dashboard' : 'Sign in to TRACK'}
              </Link>
              <a className="btn btn-secondary" href="#features">
                Explore features
              </a>
            </div>
          </div>
        </section>

        {/* The real application, captured from the live administrator
            dashboard. Deliberately not a mock-up, and no invented figures. */}
        <section className="landing-preview" aria-label="Product preview">
          <figure className="preview-window">
            <div className="preview-chrome" aria-hidden="true">
              <span className="preview-dots">
                <i />
                <i />
                <i />
              </span>
              <span className="preview-title">TRACK · Administrator dashboard</span>
            </div>

            <img
              src={dashboardShot}
              width={1324}
              height={904}
              fetchPriority="high"
              alt="The TRACK administrator dashboard: quick actions, counts of students, teachers and parents, active requirements, and breakdowns of submission status and school attendance."
            />

            <figcaption>
              The TRACK administrator dashboard, showing the school&rsquo;s own
              records.
            </figcaption>
          </figure>
        </section>

        <section
          className="landing-section"
          id="features"
          aria-labelledby="features-heading"
        >
          <h2 id="features-heading">Built for how the school already works</h2>
          <p className="ls-lede">
            One shared record of what is due, what was submitted and who was
            present, for administrators, teachers, students and parents.
          </p>

          <div className="feature-grid">
            {FEATURES.map((feature) => (
              <article className="feature-card" key={feature.title}>
                <span className="fc-icon" aria-hidden="true">
                  <Icon name={feature.icon} size={18} />
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="landing-band"
          id="how-it-works"
          aria-labelledby="how-heading"
        >
          <div className="landing-section">
            <h2 id="how-heading">How it works</h2>
            <p className="ls-lede">
              From the moment a teacher posts a requirement to the moment a
              parent checks on it.
            </p>

            <ol className="how-steps">
              {STEPS.map((step, index) => (
                <li className="how-step" key={step.title}>
                  <span className="step-icon" aria-hidden="true">
                    <Icon name={step.icon} size={18} />
                  </span>
                  <p className="step-eyebrow">Step {index + 1}</p>
                  <h3>{step.title}</h3>
                  <p className="step-body">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="landing-foot">
        <div className="landing-foot-inner">
          <Logo variant="light" />
          <p className="foot-school">Kiwalan National High School</p>
          <p className="foot-place">Iligan City, Philippines</p>
          <p className="foot-acronym">
            TRACK · Tracking Requirements, Attendance &amp; Communication
          </p>
        </div>
      </footer>
    </div>
  )
}
