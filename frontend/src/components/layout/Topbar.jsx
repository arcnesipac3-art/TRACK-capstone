import { useLocation } from 'react-router-dom'
import Icon from '../Icon'
import Breadcrumbs from './Breadcrumbs'
import NotificationBell from './NotificationBell'
import UserProfileMenu from './UserProfileMenu'
import useFetch from '../../hooks/useFetch'
import { titleForPath, trailForPath } from '../../config/navigation'
import { useAuth } from '../../context/AuthContext'

const SCHOOL_NAME = 'Kiwalan National High School'

export default function Topbar({ onOpenMenu, notifications, hasContext = false, contextOpen = false, onToggleContext }) {
  const location = useLocation()
  const { user } = useAuth()
  const trail = trailForPath(location.pathname, user?.role)
  const title = titleForPath(location.pathname, user?.role)

  // Which school year the whole screen is about. Reads are open to every
  // signed-in role, so this is context rather than a permission check; when no
  // year is flagged active the chip simply stays out of the way.
  const schoolYears = useFetch('/school-years/', {
    list: true,
    params: { is_active: true },
  })
  const activeYear = (schoolYears.data || [])[0]

  const items = notifications?.data || []
  const unreadCount = items.filter((item) => !item.is_read).length

  return (
    <header className="topbar">
      <button
        type="button"
        className="menu-btn"
        onClick={onOpenMenu}
        aria-label="Open navigation menu"
      >
        <Icon name="menu" size={19} />
      </button>

      <div className="topbar-context">
        <div className="topbar-title">{title}</div>
        <Breadcrumbs trail={trail} />
      </div>

      <div className="topbar-meta">
        <span className="topbar-school">{SCHOOL_NAME}</span>
        {activeYear && (
          <span className="topbar-year" title="Active school year">
            <Icon name="calendar" size={13} />
            {activeYear.label}
          </span>
        )}
      </div>

      {hasContext && (
        <button
          type="button"
          className={`topbar-context-btn${contextOpen ? ' active' : ''}`}
          onClick={onToggleContext}
          aria-expanded={contextOpen}
          aria-label={
            contextOpen ? 'Hide context panel' : 'Show context panel'
          }
          title={contextOpen ? 'Hide context panel' : 'Show context panel'}
        >
          <Icon name="panelRight" size={17} />
        </button>
      )}

      <NotificationBell
        items={items}
        loading={notifications?.loading}
        unreadCount={unreadCount}
        onChanged={notifications?.reload}
      />
      <UserProfileMenu />
    </header>
  )
}
