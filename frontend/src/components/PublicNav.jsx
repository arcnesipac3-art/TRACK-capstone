import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Icon from './Icon'
import Logo from './Logo'
import { useAuth } from '../context/AuthContext'
import { dashboardPath } from '../utils/format'

/**
 * Shared navigation header used by every public page.
 *
 * Props:
 *   activeSection  – string id of the currently-visible section (LandingPage
 *                    passes this from its scroll-spy; other pages omit it)
 *   onScrollToTop  – optional callback for the Home link (LandingPage passes
 *                    its smooth-scroll handler; other pages navigate normally)
 */
export default function PublicNav({ activeSection = '', onScrollToTop }) {
  const { isAuthenticated, user } = useAuth()
  const signedIn = isAuthenticated && Boolean(user)
  const dashboardHref = signedIn ? dashboardPath(user.role) : '/login'
  const { pathname } = useLocation()

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Close on Escape, lock body scroll while open
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

  // Close mobile menu on route change
  useEffect(() => { setMobileMenuOpen(false) }, [pathname])

  const isLanding = pathname === '/'

  // Active class helper — for landing: match section id; for other pages: match path
  function navClass(sectionId, path) {
    if (isLanding) return activeSection === sectionId ? 'nav-active' : ''
    return pathname === path ? 'nav-active' : ''
  }

  // Home link — on landing page smooth-scrolls to top; elsewhere navigates to /
  const HomeLink = isLanding
    ? <a href="#" className={!activeSection ? 'nav-active' : ''} onClick={(e) => { e.preventDefault(); onScrollToTop?.() }}>Home</a>
    : <Link to="/" className={navClass('', '/')}>Home</Link>

  const NAV_LINKS = (close = null) => (
    <>
      {isLanding
        ? <a href="#" className={!activeSection ? 'nav-active' : ''} onClick={(e) => { e.preventDefault(); onScrollToTop?.(); close?.() }}>Home</a>
        : <Link to="/" className={navClass('', '/')} onClick={close}>Home</Link>
      }
      {isLanding
        ? <a href="#problem" className={navClass('problem')} onClick={close}>The Problem</a>
        : <Link to="/#problem" onClick={close}>The Problem</Link>
      }
      {isLanding
        ? <a href="#features" className={navClass('features')} onClick={close}>Features</a>
        : <Link to="/#features" onClick={close}>Features</Link>
      }
      {isLanding
        ? <a href="#how-it-works" className={navClass('how-it-works')} onClick={close}>How It Works</a>
        : <Link to="/#how-it-works" onClick={close}>How It Works</Link>
      }
      {isLanding
        ? <a href="#roles" className={navClass('roles')} onClick={close}>Roles</a>
        : <Link to="/#roles" onClick={close}>Roles</Link>
      }
      {isLanding
        ? <a href="#faq" className={navClass('faq')} onClick={close}>FAQ</a>
        : <Link to="/#faq" onClick={close}>FAQ</Link>
      }
      {pathname === '/location'
        ? <a href="#map" onClick={close}>Find Us</a>
        : <Link to="/location" className={pathname === '/location' ? 'nav-active' : ''} onClick={close}>Find Us</Link>
      }
    </>
  )

  return (
    <>
      <header className="pub-nav">
        {/* Brand */}
        <Link className="pub-nav-brand" to="/" aria-label="TRACK — back to home">
          <img src="/knhs-seal.png" alt="Kiwalan National High School seal" className="pub-nav-seal" />
          <Logo size="sm" />
        </Link>

        {/* Desktop links */}
        <nav className="pub-nav-links" aria-label="Site sections">
          {NAV_LINKS()}
        </nav>

        {/* CTA button */}
        <Link className="btn btn-primary pub-nav-cta" to={dashboardHref} style={{ flexShrink: 0 }}>
          {signedIn ? 'Open dashboard' : 'Sign In'}
        </Link>

        {/* Hamburger — shown on mobile via CSS */}
        <button
          type="button"
          className="pub-nav-menu-btn"
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((v) => !v)}
        >
          <Icon name={mobileMenuOpen ? 'close' : 'menu'} size={20} />
        </button>
      </header>

      {/* Mobile dropdown */}
      {mobileMenuOpen && (
        <div className="mob-nav" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="mob-nav-divider" aria-hidden="true" />
          <nav className="mob-nav-links" aria-label="Mobile navigation">
            {NAV_LINKS(() => setMobileMenuOpen(false))}
          </nav>
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
    </>
  )
}
