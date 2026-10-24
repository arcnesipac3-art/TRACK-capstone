import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import dashboardShot from '../assets/dashboard.webp'
import { useAuth } from '../context/AuthContext'
import { dashboardPath } from '../utils/format'

const SITE_YEAR = new Date().getFullYear()
const REVEAL_SETTLE_MS = 600

/* ── Content data ─────────────────────────────────────────────────────────── */

const PROBLEMS = [
  {
    icon: 'clipboard',
    title: 'Lost Requirements',
    body: 'Teachers post on group chats. Students miss deadlines because the message scrolled away.',
  },
  {
    icon: 'calendar',
    title: 'Manual Attendance',
    body: 'Paper class records, manual counting, and no way for parents to know unless they visit.',
  },
  {
    icon: 'layers',
    title: 'Fragmented Information',
    body: 'Fees, schedules, announcements, and submissions all live in different places — if they are written down at all.',
  },
]

const FEATURES = [
  {
    icon: 'clipboard',
    title: 'Requirements Tracking',
    body: 'Every assignment, project and quiz for every class — with its deadline — in one list the whole section can see.',
  },
  {
    icon: 'checkSquare',
    title: 'Submission Review',
    body: 'Students upload their work before the deadline. Teachers verify or return it for revision, and the status updates for everyone instantly.',
  },
  {
    icon: 'calendar',
    title: 'Attendance Monitoring',
    body: 'Teachers record attendance per session. Advisers and administrators get the school-wide roll-up in real time.',
  },
  {
    icon: 'clock',
    title: 'Class Schedules',
    body: 'Administrators lay out each section\'s timetable. Any double-booked class is flagged as a conflict automatically.',
  },
  {
    icon: 'users',
    title: 'Parent Access',
    body: 'Guardians follow their own child\'s submissions and attendance — nothing beyond their own children is ever visible.',
  },
  {
    icon: 'megaphone',
    title: 'Announcements',
    body: 'School-wide and audience-targeted notices reach staff, students and parents where they already track their work.',
  },
  {
    icon: 'bell',
    title: 'Real-time Notifications',
    body: 'New requirements, verified submissions, absences and approaching deadlines each raise an in-app notification automatically.',
  },
  {
    icon: 'creditCard',
    title: 'Fees & Assessments',
    body: 'Administrators set fee categories and assessments. Students and parents see exactly what is owed and what has been paid.',
  },
]

const STEPS = [
  {
    icon: 'clipboard',
    title: 'Sign In to Your Account',
    body: 'Use the account issued by the school registrar. One sign-in gives you access to every module your role is authorized for.',
  },
  {
    icon: 'send',
    title: 'Find Your Role\'s Dashboard',
    body: 'Administrators, teachers, students and parents each land on a dashboard that shows only what is relevant to them.',
  },
  {
    icon: 'chart',
    title: 'Track Everything in One Place',
    body: 'Requirements, submissions, attendance, fees and announcements — all updated in real time, no refreshing, no chasing.',
  },
]

const TRUST = [
  {
    icon: 'shield',
    title: 'Role-scoped Records',
    body: 'Every account can only see the records it is authorized for. A parent sees their own children. A student sees their own work. Nothing crosses.',
  },
  {
    icon: 'checkCircle',
    title: 'Audit Trail',
    body: 'Every significant action — account changes, permission grants, fee voids — is written to an immutable audit log with timestamp and actor.',
  },
  {
    icon: 'clock',
    title: 'Real-time Updates',
    body: 'Submissions, attendance records, payment status and notifications reflect the latest server data. No stale caches, no guessing.',
  },
  {
    icon: 'user',
    title: 'Registrar-issued Accounts',
    body: 'There is no public sign-up. Every account is issued and controlled by the school. Unauthorized access is not possible by design.',
  },
]

const ROLES = [
  {
    icon: 'settings',
    title: 'Administrators',
    body: 'Set the school up once, then oversee every section from one place.',
    points: [
      'Manage users, sections, class assignments and schedules',
      'Set fee categories and publish assessments',
      'View requirement and attendance roll-ups school-wide',
    ],
  },
  {
    icon: 'book',
    title: 'Teachers',
    body: 'Run the classes you already teach from a single organized list.',
    points: [
      'Post requirements with deadlines for each class',
      'Verify student submissions or return them for revision',
      'Record attendance for every class session',
    ],
  },
  {
    icon: 'gradCap',
    title: 'Students',
    body: 'Know exactly what is due, what is pending and what has been verified.',
    points: [
      'See every requirement and deadline in one list',
      'Submit work and track it through the review process',
      'Check your own attendance record and fee balance',
    ],
  },
  {
    icon: 'users',
    title: 'Parents',
    body: "Stay informed about your child's school life without waiting for a note.",
    points: [
      "See your child's submissions, attendance and fees",
      'Get notified when work is reviewed or a notice is posted',
      'Scoped strictly to your own children — no other records are visible',
    ],
  },
]

const FAQS = [
  {
    q: 'Is TRACK free to use?',
    a: 'Yes. TRACK is provided free of charge to all students, teachers, parents and staff of Kiwalan National High School as a school service.',
  },
  {
    q: 'How do I get an account?',
    a: 'Accounts are issued by the school registrar — there is no public sign-up. Contact the TRACK administrator if you need access or if your credentials have stopped working.',
  },
  {
    q: 'What can a parent or student see?',
    a: 'Each role is scoped to its own records only. A parent sees their own children\'s data; a student sees their own requirements, submissions, attendance and fees. No account can open another person\'s records.',
  },
  {
    q: 'What happens after a student submits work?',
    a: 'The submission enters "awaiting verification." The teacher then marks it verified or returns it for revision with a reason. The student and their parent see the updated status immediately.',
  },
  {
    q: 'How is attendance recorded?',
    a: 'A teacher marks each student as present, absent, late or excused during the class session. Parents are notified when a child is marked absent or late, and administrators get the school-wide roll-up.',
  },
  {
    q: 'Do I need to install anything?',
    a: 'No. TRACK runs in any modern browser on a phone, tablet or computer. The layout adapts to the screen it is opened on.',
  },
  {
    q: 'Is my data safe?',
    a: 'All records are scoped strictly by role and enforced server-side. Every significant action is logged in an audit trail. Accounts are issued and revoked by the school — there is no way to self-register.',
  },
  {
    q: 'Where do announcements and reminders appear?',
    a: 'Inside the portal. Announcements, deadline reminders, overdue items and review results land in the notification list of the users they are addressed to.',
  },
]

/* ── FAQ Accordion ────────────────────────────────────────────────────────── */

function FaqAccordion({ items }) {
  const [openIndex, setOpenIndex] = useState(null)

  function toggle(idx) {
    setOpenIndex((prev) => (prev === idx ? null : idx))
  }

  return (
    <div className="faq-list" role="list">
      {items.map((item, idx) => {
        const isOpen = openIndex === idx
        const panelId = `faq-panel-${idx}`
        const triggerId = `faq-trigger-${idx}`
        return (
          <div
            className={`faq-item${isOpen ? ' faq-item--open' : ''}`}
            key={item.q}
            role="listitem"
          >
            <button
              id={triggerId}
              className="faq-summary"
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => toggle(idx)}
            >
              <span className="faq-question">{item.q}</span>
              <span className="faq-chev" aria-hidden="true">
                <Icon name="chevronDown" size={18} />
              </span>
            </button>
            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              className="faq-body"
              hidden={!isOpen}
            >
              <div className="faq-body-inner">
                <p className="faq-answer">{item.a}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const { isAuthenticated, user } = useAuth()
  const rootRef = useRef(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const signedIn = isAuthenticated && Boolean(user)
  const dashboardHref = signedIn ? dashboardPath(user.role) : '/login'

  // Close mobile menu on route change or escape key
  useEffect(() => {
    if (!mobileMenuOpen) return
    const handleKey = (e) => { if (e.key === 'Escape') setMobileMenuOpen(false) }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [mobileMenuOpen])

  // Smooth-scroll all in-page anchor links (#section) inside .landing.
  // Since .landing is the scroll container (not html/body), native
  // scroll-behavior:smooth on html doesn't apply here. We intercept every
  // click on an <a href="#..."> and manually scroll the container so the
  // target sits just below the sticky nav (NAV_H offset).
  useEffect(() => {
    const container = rootRef.current
    if (!container) return undefined
    const NAV_H = 76 // matches .landing-nav height (64px mobile, 76px desktop)

    function handleAnchorClick(e) {
      const anchor = e.target.closest('a[href^="#"]')
      if (!anchor) return
      const id = anchor.getAttribute('href').slice(1)
      if (!id) return
      const target = document.getElementById(id)
      if (!target) return
      e.preventDefault()
      const targetTop = target.getBoundingClientRect().top
      const containerTop = container.getBoundingClientRect().top
      const offset = targetTop - containerTop + container.scrollTop - NAV_H
      container.scrollTo({ top: offset, behavior: 'smooth' })
      // Close mobile menu if open
      setMobileMenuOpen(false)
    }

    container.addEventListener('click', handleAnchorClick)
    return () => container.removeEventListener('click', handleAnchorClick)
  }, [])

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
      <a className="landing-skip" href="#main-content">Skip to content</a>

      {/* ── Nav ───────────────────────────────────────────────────── */}
      <header className="landing-nav">
        <div className="landing-nav-brand">
          <img src="/knhs-seal.png" alt="Kiwalan National High School seal" className="landing-nav-seal" />
          <Logo size="sm" />
        </div>
        <nav className="landing-nav-links" aria-label="Landing sections">
          <a href="#problem">The Problem</a>
          <a href="#features">Features</a>
          <a href="#how-it-works">How it Works</a>
          <a href="#roles">Roles</a>
          <a href="#faq">FAQ</a>
        </nav>
        <Link className="btn btn-primary" to={dashboardHref} style={{ flexShrink: 0 }}>
          {signedIn ? 'Open dashboard' : 'Sign in'}
        </Link>
        {/* Mobile hamburger / close — visible only on small screens via CSS */}
        <button
          type="button"
          className="landing-nav-menu-btn"
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((v) => !v)}
        >
          <Icon name={mobileMenuOpen ? 'close' : 'menu'} size={20} />
        </button>
      </header>

      {/* ── Mobile nav dropdown ──────────────────────────────────── */}
      {mobileMenuOpen && (
        <div
          className="mob-nav"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          {/* Divider / header row already comes from the navbar above;
              a thin separator reinforces the panel edge */}
          <div className="mob-nav-divider" aria-hidden="true" />

          {/* Scrollable link area */}
          <nav className="mob-nav-links" aria-label="Mobile navigation">
            <a href="#problem"     onClick={() => setMobileMenuOpen(false)}>The Problem</a>
            <a href="#features"    onClick={() => setMobileMenuOpen(false)}>Features</a>
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>How it Works</a>
            <a href="#roles"       onClick={() => setMobileMenuOpen(false)}>Roles</a>
            <a href="#security"    onClick={() => setMobileMenuOpen(false)}>Security</a>
            <a href="#faq"         onClick={() => setMobileMenuOpen(false)}>FAQ</a>
          </nav>

          {/* Full-width CTA */}
          <div className="mob-nav-cta">
            <Link
              className="mob-nav-cta-btn"
              to={dashboardHref}
              onClick={() => setMobileMenuOpen(false)}
            >
              {signedIn ? 'Open dashboard' : 'Sign in to TRACK'}
            </Link>
          </div>
        </div>
      )}

      <main className="landing-main" id="main-content" tabIndex={-1}>

        {/* ── Hero ──────────────────────────────────────────────── */}
        <section className="landing-hero" aria-labelledby="hero-heading">
          <div className="hero-layout">

            {/* ── Left: text content ── */}
            <div className="hero-content">
              <span className="hero-kicker">
                <img src="/knhs-seal.png" alt="" aria-hidden="true" className="hero-knhs-seal" />
                Kiwalan National High School · Iligan City
              </span>

              <h1 id="hero-heading">
                All school records.<br />
                <span className="hero-accent">One portal.</span>
              </h1>

              <p className="hero-sub">
                TRACK gives Kiwalan National High School a single, secure
                place for requirements, attendance, fees and communication —
                accessible to administrators, teachers, students and parents,
                anytime, anywhere.
              </p>

              <div className="hero-actions">
                <Link className="btn hero-btn-primary" to={dashboardHref}>
                  {signedIn ? 'Go to my dashboard' : 'Sign in to TRACK'}
                </Link>
                <a className="btn hero-btn-secondary" href="#features">Explore features</a>
              </div>

              <p className="hero-note">Accounts are issued by the school registrar.</p>

              <div className="hero-stats">
                <div className="hero-stat">
                  <div className="hero-stat-value">4 Roles</div>
                  <div className="hero-stat-label">Admins · Teachers<br />Students · Parents</div>
                </div>
                <div className="hero-stat">
                  <div className="hero-stat-value">8 Features</div>
                  <div className="hero-stat-label">Requirements,<br />Attendance, Fees &amp; more</div>
                </div>
                <div className="hero-stat">
                  <div className="hero-stat-value">1 Portal</div>
                  <div className="hero-stat-label">Everything in one place</div>
                </div>
              </div>
            </div>

            {/* ── Right: student photo + floating role cards ── */}
            <div className="hero-visual" aria-hidden="true">
              {/* Student photo — needs student.png in /public */}
              <img
                src="/student.png"
                alt="A KNHS student in uniform holding a tablet"
                className="hero-student-img"
              />

              {/* Floating role cards */}
              <div className="hero-card hero-card-student">
                <div className="hero-card-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                </div>
                <div>
                  <div className="hero-card-title">Student</div>
                  <div className="hero-card-desc">Grades · Attendance<br />Schedule · Notifications</div>
                </div>
              </div>

              <div className="hero-card hero-card-teacher">
                <div className="hero-card-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8"/><path d="M12 12H6"/><path d="M12 16H6"/><path d="M8 8H6"/><circle cx="19" cy="19" r="3"/><path d="m22 22-1.5-1.5"/></svg>
                </div>
                <div>
                  <div className="hero-card-title">Teacher</div>
                  <div className="hero-card-desc">Attendance · Grades<br />Materials · Messages</div>
                </div>
              </div>

              <div className="hero-card hero-card-parent">
                <div className="hero-card-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <div>
                  <div className="hero-card-title">Parent</div>
                  <div className="hero-card-desc">Child Grades · Attendance<br />Schedule · Notifications</div>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* ── Preview ───────────────────────────────────────────── */}
        <section className="landing-preview" aria-label="Product preview" data-reveal>
          <figure className="preview-window">
            <div className="preview-chrome" aria-hidden="true">
              <span className="preview-dots"><i /><i /><i /></span>
              <span className="preview-title">TRACK · Administrator dashboard</span>
            </div>
            <img
              src={dashboardShot}
              width={1324}
              height={904}
              fetchPriority="high"
              alt="The TRACK administrator dashboard showing quick actions, student and teacher counts, active requirements, and attendance summaries."
            />
            <figcaption>The TRACK administrator dashboard, showing the school&rsquo;s live records.</figcaption>
          </figure>
        </section>

        {/* ── Problem ───────────────────────────────────────────── */}
        <section className="landing-band" id="problem" aria-labelledby="problem-heading" data-reveal>
          <div className="landing-section">
            <p className="ls-eyebrow">The Problem</p>
            <h2 id="problem-heading">School records are scattered. TRACK fixes that.</h2>
            <p className="ls-lede">
              Filipino students and teachers deserve better than group chats, paper forms and missed deadlines.
            </p>
            <div className="problem-grid">
              {PROBLEMS.map((p) => (
                <article className="problem-card" key={p.title}>
                  <span className="problem-icon" aria-hidden="true">
                    <Icon name={p.icon} size={20} />
                  </span>
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Solution callout ──────────────────────────────────── */}
        <section className="solution-section" aria-labelledby="solution-heading" data-reveal>
          <div className="solution-card">
            <p className="solution-pill">
              <span aria-hidden="true">→</span> The Solution
            </p>
            <h2 id="solution-heading">
              TRACK brings every school record into one secure, easy-to-use portal.
            </h2>
            <p className="solution-quote">
              &ldquo;No more chasing teachers on chat. Your school, in your browser.&rdquo;
            </p>
          </div>
        </section>

        {/* ── Features ──────────────────────────────────────────── */}
        <section className="feat-section" id="features" aria-labelledby="features-heading" data-reveal>
          <div className="feat-section-inner">
            <div className="feat-header">
              <p className="feat-eyebrow">Features</p>
              <h2 id="features-heading">
                Everything You Need,{' '}
                <span className="feat-heading-accent">In One Place</span>
              </h2>
              <p className="feat-subheading">
                Designed for every role at KNHS — simple, secure and accessible on any device.
              </p>
            </div>
            <div className="feature-grid">
              {FEATURES.map((feature) => (
                <article className="feature-card" key={feature.title}>
                  <span className="fc-icon" aria-hidden="true">
                    <Icon name={feature.icon} size={22} />
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────── */}
        <section className="how-section" id="how-it-works" aria-labelledby="how-heading" data-reveal>
          <div className="how-section-inner">
            <div className="how-header">
              <p className="how-eyebrow">How it Works</p>
              <h2 id="how-heading">
                Get Started in{' '}
                <span className="how-heading-accent">3 Easy Steps</span>
              </h2>
              <p className="how-subheading">From sign-in to full access — it only takes minutes.</p>
            </div>
            <div className="how-steps-wrap">
              <ol className="how-steps">
                {STEPS.map((step, index) => (
                  <li className="how-step" key={step.title}>
                    <div className="how-step-icon-wrap">
                      <span className="how-step-icon" aria-hidden="true">
                        <Icon name={step.icon} size={28} />
                      </span>
                      <span className="how-step-num" aria-hidden="true">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <h3 className="how-step-title">{step.title}</h3>
                    <p className="how-step-body">{step.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ── Roles ─────────────────────────────────────────────── */}
        <section className="landing-section" id="roles" aria-labelledby="roles-heading" data-reveal>
          <p className="ls-eyebrow">Who It&rsquo;s For</p>
          <h2 id="roles-heading">One portal, four kinds of account.</h2>
          <p className="ls-lede">
            Everyone signs in to the same system and sees only the part that belongs to them.
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

        {/* ── Trust & Security ──────────────────────────────────── */}
        <section className="trust-section" id="security" aria-labelledby="trust-heading" data-reveal>
          <div className="trust-section-inner">
            <div className="trust-left">
              <p className="trust-eyebrow">Trust &amp; Security</p>
              <h2 id="trust-heading">
                Your Data is{' '}
                <span className="trust-heading-accent">Safe With Us</span>
              </h2>
              <p className="trust-lede">
                TRACK is built on the highest standards of security and privacy.
                Official. Secure. School-controlled.
              </p>
              <div className="trust-badge">
                <Icon name="shield" size={14} aria-hidden="true" />
                Registrar-Issued Accounts Only
              </div>
            </div>
            <div className="trust-right">
              <div className="trust-grid">
                {TRUST.map((item) => (
                  <article className="trust-card" key={item.title}>
                    <span className="trust-icon" aria-hidden="true">
                      <Icon name={item.icon} size={20} />
                    </span>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────── */}
        <section className="faq-section" id="faq" aria-labelledby="faq-heading" data-reveal>
          <div className="faq-section-inner">
            <div className="faq-header">
              <p className="faq-eyebrow">FAQ</p>
              <h2 id="faq-heading" className="faq-heading">
                Frequently Asked{' '}
                <span className="faq-heading-accent">Questions</span>
              </h2>
              <p className="faq-subheading">Everything you need to know about TRACK.</p>
            </div>
            <FaqAccordion items={FAQS} />
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────────────── */}
        <section className="landing-cta" aria-labelledby="cta-heading" data-reveal>
          <div className="cta-card">
            <div className="cta-copy">
              <h2 id="cta-heading">Start using TRACK today.</h2>
              <p>
                Used by students, teachers, parents and staff of Kiwalan National High School.
                Sign in with the account the school issued you.
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

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="landing-foot">
        <div className="landing-foot-inner">

          {/* Brand column */}
          <div className="foot-brand">
            <button
              type="button"
              className="foot-logo-btn"
              aria-label="Back to top"
              onClick={() => {
                const container = document.querySelector('.landing')
                if (container) container.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            >
              <img src="/knhs-seal.png" alt="KNHS seal" className="foot-knhs-seal" />
              <Logo variant="light" />
            </button>
            <p className="foot-tagline">
              Tracking Requirements, Attendance &amp; Communication for
              Kiwalan National High School.
            </p>
            <p className="foot-dept">
              Kiwalan National High School · Iligan City, Philippines
            </p>
          </div>

          {/* On this page */}
          <nav className="foot-col" aria-label="Page sections">
            <p className="foot-col-title">On This Page</p>
            <a href="#problem">The Problem</a>
            <a href="#features">Features</a>
            <a href="#how-it-works">How it Works</a>
            <a href="#roles">Who it&rsquo;s for</a>
            <a href="#security">Security</a>
            <a href="#faq">FAQ</a>
          </nav>

          {/* Account */}
          <nav className="foot-col" aria-label="Account links">
            <p className="foot-col-title">Account</p>
            <Link to={dashboardHref}>{signedIn ? 'Open dashboard' : 'Sign in to TRACK'}</Link>
            <a href="#faq">How to get an account</a>
            <a href="#security">Data &amp; Privacy</a>
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
