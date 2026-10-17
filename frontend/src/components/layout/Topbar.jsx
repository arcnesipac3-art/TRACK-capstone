import { useLocation } from 'react-router-dom'
import Icon from '../Icon'
import NotificationBell from './NotificationBell'
import UserProfileMenu from './UserProfileMenu'
import { titleForPath } from '../../config/navigation'
import { useAuth } from '../../context/AuthContext'

export default function Topbar({ onOpenMenu, notifications }) {
  const location = useLocation()
  const { user } = useAuth()
  const title = titleForPath(location.pathname, user?.role)

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

      <div className="grow" style={{ minWidth: 0 }}>
        <div className="topbar-title">{title}</div>
        <div className="topbar-school">Kiwalan National High School</div>
      </div>

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
