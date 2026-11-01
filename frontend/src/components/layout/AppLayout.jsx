import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import ContextPanel from './ContextPanel'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import MobileNavigation from './MobileNavigation'
import PageLoader from '../loading/PageLoader'
import RouteTransition from '../loading/RouteTransition'
import { contextPanelFor } from '../context/registry'
import useFetch from '../../hooks/useFetch'
import { useAuth } from '../../context/AuthContext'
import { NotificationsContext } from '../../context/NotificationsContext'

/** Where the desktop rail preference lives, so a reload keeps it. */
const RAIL_KEY = 'track.sidebar.rail'

/** Desktop preference for the contextual column (open by default). */
const CONTEXT_KEY = 'track.context.open'

/** The tablet/phone breakpoint at which the context column becomes a drawer. */
const NARROW_QUERY = '(max-width: 1023px)'

/**
 * Authenticated application shell — three columns:
 *  - fixed sidebar on desktop, collapsible to an icon rail,
 *  - the routed workspace in the center,
 *  - a contextual column on the right for routes that have one, collapsible
 *    inline on desktop and available as a drawer on tablet/mobile,
 *  - bottom navigation on phones,
 *  - sticky topbar with page title, breadcrumb, school year, notifications,
 *    the context toggle and the profile menu.
 */
export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [rail, setRail] = useState(() => window.localStorage.getItem(RAIL_KEY) === '1')
  const [contextOpen, setContextOpen] = useState(
    () => window.localStorage.getItem(CONTEXT_KEY) !== '0'
  )
  const [contextDrawer, setContextDrawer] = useState(false)
  const [narrow, setNarrow] = useState(isNarrow)
  const location = useLocation()
  const { user } = useAuth()
  const notifications = useFetch('/notifications/', {
    list: true,
    params: { page_size: 100 },
  })

  // Close the drawers whenever the route changes. Adjusting state during
  // render (rather than in an effect) avoids an extra committed render with
  // the old drawer still open — see react.dev/learn/you-might-not-need-an-effect.
  const [lastPath, setLastPath] = useState(location.pathname)
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    setDrawerOpen(false)
    setContextDrawer(false)
  }

  // Track the inline-vs-drawer breakpoint. `matchMedia` is missing in some
  // test environments; without it the shell behaves as a desktop viewport.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const mql = window.matchMedia(NARROW_QUERY)
    // The initial value already came from `isNarrow()` during state init;
    // this listener only has to react to later viewport changes.
    const onChange = (event) => setNarrow(event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  // Lock body scroll while either drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen || contextDrawer ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen, contextDrawer])

  // Escape dismisses the context drawer, like the navigation one should.
  useEffect(() => {
    if (!contextDrawer) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setContextDrawer(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [contextDrawer])

  const unreadCount = (notifications.data || []).filter((n) => !n.is_read).length
  const portal = PORTAL_ROLES.includes(user?.role) ? user.role : undefined
  const panel = contextPanelFor(location.pathname)

  function toggleRail(next) {
    setRail(next)
    window.localStorage.setItem(RAIL_KEY, next ? '1' : '0')
  }

  function toggleContext() {
    if (narrow) {
      setContextDrawer((wasOpen) => !wasOpen)
      return
    }
    setContextOpen((wasOpen) => {
      window.localStorage.setItem(CONTEXT_KEY, wasOpen ? '0' : '1')
      return !wasOpen
    })
  }

  return (
    <NotificationsContext.Provider value={notifications}>
      <div
        className={[
          'app-shell',
          rail ? 'nav-rail' : '',
          panel && contextOpen ? 'context-open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-portal={portal}
      >
        <Sidebar rail={rail} onToggleRail={toggleRail} />

        {drawerOpen && (
          <>
            <button
              type="button"
              className="drawer-overlay"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
            />
            <Sidebar variant="drawer" onNavigate={() => setDrawerOpen(false)} />
          </>
        )}

        <div className="app-main">
          <Topbar
            onOpenMenu={() => setDrawerOpen(true)}
            notifications={notifications}
            hasContext={Boolean(panel)}
            contextOpen={narrow ? contextDrawer : contextOpen}
            onToggleContext={toggleContext}
          />
          <main className="app-content" id="main-content">
            {/* Pages are lazy chunks; keep the shell on screen while one loads
                and fade the destination in over the shell rather than
                remounting anything (no refetch on navigation). */}
            <RouteTransition>
              <Suspense
                fallback={<PageLoader label="Loading page…" minHeight={320} />}
              >
                <Outlet />
              </Suspense>
            </RouteTransition>
          </main>
        </div>

        {/* Contextual column: inline beside the workspace on wide screens… */}
        {panel && !narrow && (
          <ContextPanel
            title={panel.title}
            open={contextOpen}
            onCollapse={() => {
              setContextOpen(false)
              window.localStorage.setItem(CONTEXT_KEY, '0')
            }}
          >
            {/* Content unmounts while collapsed so the off-screen column
                holds no focusable controls. */}
            {contextOpen ? panel.element : null}
          </ContextPanel>
        )}

        {/* …and a slide-over on tablet/mobile. */}
        {panel && contextDrawer && (
          <>
            <button
              type="button"
              className="drawer-overlay"
              aria-label="Close context panel"
              onClick={() => setContextDrawer(false)}
            />
            <ContextPanel
              title={panel.title}
              variant="drawer"
              onClose={() => setContextDrawer(false)}
            >
              {panel.element}
            </ContextPanel>
          </>
        )}

        <MobileNavigation
          unreadCount={unreadCount}
          onOpenMenu={() => setDrawerOpen(true)}
        />
      </div>
    </NotificationsContext.Provider>
  )
}

function isNarrow() {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia(NARROW_QUERY).matches
    : false
}

/**
 * The roles the soft portal styling is written for. Staff screens keep the
 * enterprise treatment, and the account-less enrollment flow renders in
 * `PublicEnrollLayout` — never this shell — so it cannot inherit the scope.
 */
const PORTAL_ROLES = ['student', 'parent']
