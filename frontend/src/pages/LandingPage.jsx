import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import dashboardShot from '../assets/dashboard.webp'
import { useAuth } from '../context/AuthContext'
import { dashboardPath } from '../utils/format'

/* Computed once at module load: the footer prints it, and a render-time `new
   Date()` would trip the purity lint rule on every re-render. */
const SITE_YEAR = new Date().getFullYear()

/* Must outlast the .reveal-in fade (520ms) by a small margin — it is the
   backstop that pins the final state afterwards. */
const REVEAL_SETTLE_MS = 600

const FEATURES = [
  {
    icon: 'clipboard',
    title: 'Requirements tracking',
    body: 'Every assignment, project and quiz for a class, with its deadline, in one list the whole section can see.',
  },
  {
    icon: 'checkSquare',
    title: 'Submission review',
    body: 'Students upload or link their work before the deadline. The teacher verifies it, or returns it for revision, and the status updates for everyone watching it.',
  },
  {
    icon: 'calendar',
    title: 'Attendance monitoring',
    body: 'Teachers record attendance per class and per day. Advisers and administrators get the roll-up.',
  },
  {
    icon: 'clock',
    title: 'Class schedules',
    body: 'Administrators lay out each section\u2019s timetable, and any class booked on top of another is flagged as a conflict on the schedule.',
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
  {
    icon: 'bell',
    title: 'Notifications',
    body: 'New requirements, reviewed work, an absence marked for a child, an approaching deadline and posted notices each raise an in-app notification.',
  },
  {
    icon: 'creditCard',
    title: 'Fees and assessments',
    body: 'Administrators set the fee categories and assessments. Students and parents see what is owed and what has been paid on their own account.',
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

/* One card per role in the portal. Every bullet is a screen that exists in the
   shipped application — nothing here is aspirational. */
const ROLES = [
  {
    icon: 'settings',
    title: 'Administrators',
    body: 'Set the school up once, then keep an eye on every section from one place.',
    points: [
      'Manage users, sections, class assignments and schedules',
      'Set fee categories and assessments',
      'See requirement and attendance roll-ups school-wide',
    ],
  },
  {
    icon: 'book',
    title: 'Teachers',
    body: 'Run the classes they already teach out of a single list of requirements.',
    points: [
      'Post requirements with a deadline for each class',
      'Verify submissions or return them for revision',
      'Record attendance for every class session',
    ],
  },
  {
    icon: 'gradCap',
    title: 'Students',
    body: 'Know what is due this week, what is still pending and what is already verified.',
    points: [
      'See every requirement and deadline in one list',
      'Submit work and follow it through review',
      'Check their own attendance and fees',
    ],
  },
  {
    icon: 'users',
    title: 'Parents',
    body: "Follow their child's school work without waiting for a note to come home.",
    points: [
      "See their own child's submissions and attendance",
      'Get notified when work is returned or a notice is posted',
      'Nothing beyond their own children is visible to them',
    ],
  },
]

/* Answered from the product as it ships: no self sign-up, role-scoped records. */
const FAQS = [
  {
    q: 'How do I get an account?',
    a: 'Accounts are issued by the school registrar — there is no public sign-up. Ask the TRACK administrator if you need access, or if your username or password has stopped working.',
  },
  {
    q: 'What can a parent or student see?',
    a: 'Each role sees only its own scope. A parent sees their own children, and a student sees their own requirements, submissions, attendance and fees. No account can open another person\u2019s records.',
  },
  {
    q: 'What happens to work after it is submitted?',
    a: 'The submission starts as awaiting verification. The teacher marks it verified, or returns it for revision with the reason, and the student and their parent see the new status right away.',
  },
  {
    q: 'How is attendance recorded?',
    a: 'A teacher marks each student in a class session as present, absent, late or excused. Parents are notified when a child is marked absent or late, and administrators get the roll-up across classes.',
  },
  {
    q: 'Do I need to install anything?',
    a: 'No. TRACK runs in any modern browser on a phone, tablet or computer, and the layout adapts to the screen it is opened on.',
  },
  {
    q: 'Where do notices and reminders show up?',
    a: 'Inside the portal. Announcements, deadline reminders, overdue items and review results land in the notification list of the people they are meant for.',
  },
]

export default function LandingPage() {
  const { isAuthenticated, user } = useAuth()
  const rootRef = useRef(null)

  const signedIn = isAuthenticated && Boolean(user)
  const dashboardHref = signedIn ? dashboardPath(user.role) : '/login'

  /* Gentle scroll-in for the sections below the hero. The hidden starting state
     is only applied once IntersectionObserver is confirmed available, so the
     page stays fully visible without scripting or on older browsers.

     Each reveal also schedules a settle pass: the fade is a transition, and a
     backgrounded tab can suspend the document timeline mid-fade, which would
     leave an already-revealed section parked at opacity 0. The settle class
     pins the end state once the fade's window has passed, so a section can
     never stay invisible. */
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return undefined

    const targets = root.querySelectorAll('[data-reveal]')
    if (!targets.length) return undefined

    root.classList.add('reveal-ready')
    const settleTimers = new Set()
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('reveal-in')
          observer.unobserve(entry.target)

          const timer = window.setTimeout(() => {
            entry.target.classList.add('reveal-settled')
            settleTimers.delete(timer)
          }, REVEAL_SETTLE_MS)
          settleTimers.add(timer)
        })
      },
      { threshold: 0.06, rootMargin: '0px 0px -6% 0px' },
    )
    targets.forEach((target) => observer.observe(target))

    return () => {
      observer.disconnect()
      settleTimers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  return (
    <div className="landing" ref={rootRef}>
      <a className="landing-skip" href="#main-content">
        Skip to content
      </a>

      {/* Public navigation. The logo is not a link here because this is the
          page it would point at; the in-page links and the sign-in call to
          action are the whole navigation. It stays pinned while scrolling so
          the section links remain reachable on long reads. */}
      <header className="landing-nav">
        <div className="landing-nav-brand">
          <img
            src="/knhs-seal.png"
            alt="Kiwalan National High School seal"
            className="landing-nav-seal"
          />
          <Logo size="sm" />
        </div>

        <nav className="landing-nav-links" aria-label="Landing sections">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="#roles">Roles</a>
          <a href="#faq">FAQ</a>
        </nav>

        <Link className="btn btn-primary" to={dashboardHref}>
          {signedIn ? 'Open dashboard' : 'Sign in'}
        </Link>
      </header>

      <main className="landing-main" id="main-content" tabIndex={-1}>
        <section className="landing-hero" aria-labelledby="hero-heading">
          <div className="landing-hero-inner">
            <span className="hero-kicker">
              <img
                src="/knhs-seal.png"
                alt=""
                aria-hidden="true"
                className="hero-knhs-seal"
              />
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

            <p className="hero-note">
              Accounts are issued by the school registrar.
            </p>
          </div>
        </section>

        {/* The real application, captured from the live administrator
            dashboard. Deliberately not a mock-up, and no invented figures. */}
        <section
          className="landing-preview"
          aria-label="Product preview"
          data-reveal
        >
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
          data-reveal
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
          data-reveal
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

        <section
          className="landing-section"
          id="roles"
          aria-labelledby="roles-heading"
          data-reveal
        >
          <h2 id="roles-heading">One portal, four kinds of account</h2>
          <p className="ls-lede">
            Everyone signs in to the same system, and everyone sees the part of
            it that belongs to them.
          </p>

          <div className="role-grid">
            {ROLES.map((role) => (
              <article className="role-card" key={role.title}>
                <span className="rc-icon" aria-hidden="true">
                  <Icon name={role.icon} size={18} />
                </span>
                <h3>{role.title}</h3>
                <p className="rc-body">{role.body}</p>
                <ul className="role-points">
                  {role.points.map((point) => (
                    <li key={point}>
                      <span className="rp-mark" aria-hidden="true">
                        <Icon name="check" size={11} />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section
          className="landing-band"
          id="faq"
          aria-labelledby="faq-heading"
          data-reveal
        >
          <div className="landing-section">
            <h2 id="faq-heading">Questions, answered plainly</h2>
            <p className="ls-lede">
              What the portal does with records, accounts and notices.
            </p>

            <div className="faq-list">
              {FAQS.map((item) => (
                <details className="faq-item" key={item.q}>
                  <summary>
                    <span>{item.q}</span>
                    <span className="faq-chev" aria-hidden="true">
                      <Icon name="chevronDown" size={16} />
                    </span>
                  </summary>
                  <p className="faq-answer">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-cta" aria-labelledby="cta-heading" data-reveal>
          <div className="cta-card">
            <div className="cta-copy">
              <h2 id="cta-heading">Ready to open TRACK?</h2>
              <p>
                Sign in with the account the school issued you. No account yet?
                The registrar or the TRACK administrator can set one up.
              </p>
            </div>
            <div className="cta-actions">
              <Link className="btn btn-light" to={dashboardHref}>
                {signedIn ? 'Go to my dashboard' : 'Sign in to TRACK'}
                <Icon name="arrowRight" size={16} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-foot">
        <div className="landing-foot-inner">
          <div className="foot-brand">
            <Logo variant="light" />
            <p className="foot-school">Kiwalan National High School</p>
            <p className="foot-place">Iligan City, Philippines</p>
            <p className="foot-acronym">
              TRACK · Tracking Requirements, Attendance &amp; Communication
            </p>
          </div>

          <nav className="foot-col" aria-label="Footer sections">
            <p className="foot-col-title">On this page</p>
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#roles">Who it&rsquo;s for</a>
            <a href="#faq">Questions</a>
            <Link to={dashboardHref}>
              {signedIn ? 'Open dashboard' : 'Sign in'}
            </Link>
          </nav>
        </div>

        <div className="foot-bottom">
          <p>
            © {SITE_YEAR} TRACK · Kiwalan National High School
          </p>
          <p>Accounts are issued by the school registrar.</p>
        </div>
      </footer>
    </div>
  )
}
