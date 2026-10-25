import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import PublicNav from '../components/PublicNav'
import { useAuth } from '../context/AuthContext'
import { dashboardPath } from '../utils/format'

const SITE_YEAR = new Date().getFullYear()

/* Professional backdrop for privacy page. */
const HERO_BG_URL =
  'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=Cinematic%20wide%20photograph%20of%20a%20secure%20server%20room%20background%2C%20blue%20LED%20lights%2C%20professional%20technology%20environment%2C%20data%20protection%20concept%2C%20clean%20and%20modern&image_size=landscape_16_9'

const TOC = [
  { id: 'collect',      label: '1. Information We Collect' },
  { id: 'use',          label: '2. How We Use Your Data' },
  { id: 'protection',   label: '3. Data Protection' },
  { id: 'disclosure',   label: '4. Disclosure of Information' },
]

export default function PrivacyPage() {
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

  // Smooth-scroll TOC links within the res-page scroll container
  useEffect(() => {
    const container = pageRef.current
    if (!container) return undefined
    const NAV_H = 80 // nav height + a little breathing room

    function handleClick(e) {
      const anchor = e.target.closest('.lp-toc-list a[href^="#"]')
      if (!anchor) return
      const id = anchor.getAttribute('href').slice(1)
      const target = document.getElementById(id)
      if (!target) return
      e.preventDefault()
      const targetTop = target.getBoundingClientRect().top
      const containerTop = container.getBoundingClientRect().top
      const offset = targetTop - containerTop + container.scrollTop - NAV_H
      container.scrollTo({ top: offset, behavior: 'smooth' })
    }

    container.addEventListener('click', handleClick)
    return () => container.removeEventListener('click', handleClick)
  }, [])

  return (
    <div className="res-page" ref={pageRef}>
      <PublicNav />

      <main className="res-main">
        <section className="lp-hero" aria-labelledby="privacy-heading">
          <div className="lp-hero-inner">
            <p className="lp-eyebrow">Data Protection</p>
            <h1 id="privacy-heading">Privacy Policy</h1>
            <p className="lp-lede">
              How we collect, use, and protect your information at Kiwalan National High School.
            </p>
            <p className="lp-meta">Last Updated: October 2026</p>
          </div>
        </section>

        <section className="lp-layout">
          {/*  Table of contents  */}
          <details className="lp-toc" open>
            <summary>Table of Contents</summary>
            <nav className="lp-toc-list" aria-label="Privacy policy sections">
              {TOC.map((item) => (
                <a key={item.id} href={`#${item.id}`}>{item.label}</a>
              ))}
            </nav>
          </details>

          {/*  Document body  */}
          <article className="lp-doc">
            <section className="lp-section" id="collect">
              <h2>1. Information We Collect</h2>
              <p>
                We collect information necessary for school management, including:
              </p>
              <ul>
                <li>Student names, LRN, and academic records.</li>
                <li>Parent/Guardian contact information.</li>
                <li>Teacher information and attendance logs.</li>
              </ul>
            </section>

            <section className="lp-section" id="use">
              <h2>2. How We Use Your Data</h2>
              <p>
                The information collected is used solely for:
              </p>
              <ul>
                <li>Tracking student attendance and requirement submissions.</li>
                <li>Generating school reports for DepEd.</li>
                <li>Communicating school announcements and student progress.</li>
              </ul>
            </section>

            <section className="lp-section" id="protection">
              <h2>3. Data Protection</h2>
              <p>
                TRACK implements administrative, technical, and physical security measures
                to protect your personal information against unauthorized access, use, or
                disclosure, in compliance with the Data Privacy Act of 2012 (RA 10173).
              </p>
            </section>

            <section className="lp-section" id="disclosure">
              <h2>4. Disclosure of Information</h2>
              <p>
                We do not sell or share your personal information with third parties for
                marketing purposes. Information is only shared with the Department of
                Education (DepEd) as required by national educational regulations.
              </p>
            </section>

            <div className="lp-review-note">
              <strong>Review note:</strong> Additional policy details  including data
              retention periods, user rights under the Data Privacy Act, and contact
              information for privacy inquiries  should be reviewed and finalized by the
              project owner before publication.
            </div>
          </article>
        </section>
      </main>

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
          <p> {SITE_YEAR} TRACK  Kiwalan National High School  Iligan City, Philippines</p>
          <p>Accounts are issued and controlled by the school registrar.</p>
        </div>
      </footer>
    </div>
  )
}