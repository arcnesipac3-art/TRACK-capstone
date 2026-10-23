import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import MobileNavigation from './MobileNavigation'
import useFetch from '../../hooks/useFetch'
import { NotificationsContext } from '../../context/NotificationsContext'

/**
 * Authenticated application shell:
 *  - fixed sidebar on desktop,
 *  - drawer sidebar on tablet/mobile,
 *  - bottom navigation on phones,
 *  - sticky topbar with title, notifications and profile menu.
 */
export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
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

  return (
    <NotificationsContext.Provider value={notifications}>
      <div className="app-shell">
        <Sidebar />

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
            <Outlet />
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
