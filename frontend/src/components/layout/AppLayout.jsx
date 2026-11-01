import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import MobileNavigation from './MobileNavigation'
import PageLoader from '../loading/PageLoader'
import RouteTransition from '../loading/RouteTransition'
import useFetch from '../../hooks/useFetch'
import { NotificationsContext } from '../../context/NotificationsContext'

/** Where the desktop rail preference lives, so a reload keeps it. */
const RAIL_KEY = 'track.sidebar.rail'

function readRailPreference() {
  return window.localStorage.getItem(RAIL_KEY) === '1'
}

/**
 * Authenticated application shell:
 *  - fixed sidebar on desktop, collapsible to an icon rail,
 *  - drawer sidebar on tablet/mobile,
 *  - bottom navigation on phones,
 *  - sticky topbar with page title, breadcrumb, school year, notifications
 *    and profile menu.
 */
export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [rail, setRail] = useState(readRailPreference)
  const location = useLocation()
  const notifications = useFetch('/notifications/', {
    list: true,
    params: { page_size: 100 },
  })

  // Close the drawer whenever the route changes. Adjusting state during render
  // (rather than in an effect) avoids an extra committed render with the old
  // drawer still open — see react.dev/learn/you-might-not-need-an-effect.
  const [lastPath, setLastPath] = useState(location.pathname)
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    setDrawerOpen(false)
  }

  // Lock body scroll while the drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  const unreadCount = (notifications.data || []).filter((n) => !n.is_read).length

  function toggleRail(next) {
    setRail(next)
    window.localStorage.setItem(RAIL_KEY, next ? '1' : '0')
  }

  return (
    <NotificationsContext.Provider value={notifications}>
      <div className={rail ? 'app-shell nav-rail' : 'app-shell'}>
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

        <MobileNavigation
          unreadCount={unreadCount}
          onOpenMenu={() => setDrawerOpen(true)}
        />
      </div>
    </NotificationsContext.Provider>
  )
}
