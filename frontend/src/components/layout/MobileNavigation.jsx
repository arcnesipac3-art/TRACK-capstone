import { NavLink } from 'react-router-dom'
import Icon from '../Icon'
import { mobileItemsForRole } from '../../config/navigation'
import { useAuth } from '../../context/AuthContext'

/**
 * Bottom navigation for phones: the role's primary destinations plus a
 * "More" button that opens the full drawer.
 *
 * The unread badge rides on the Notifications stop itself. It used to be a
 * second hardcoded link, which duplicated the config-driven `/notifications`
 * entry that every role already lists in MOBILE_PRIMARY.
 */
export default function MobileNavigation({ unreadCount, onOpenMenu }) {
  const { user } = useAuth()
  const items = mobileItemsForRole(user?.role)

  return (
    <nav className="mobile-nav" aria-label="Quick navigation">
      <ul>
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              <Icon name={item.icon} size={19} />
              {item.label}
              {item.to === '/notifications' && unreadCount > 0 && (
                <span className="mn-badge" aria-hidden="true">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </NavLink>
          </li>
        ))}
        <li>
          <button type="button" onClick={onOpenMenu}>
            <Icon name="menu" size={19} />
            Menu
          </button>
        </li>
      </ul>
    </nav>
  )
}
