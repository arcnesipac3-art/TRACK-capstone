import { NavLink } from 'react-router-dom'
import Icon from '../Icon'
import Logo from '../Logo'
import { navForRole } from '../../config/navigation'
import { useAuth } from '../../context/AuthContext'
import { roleLabel } from '../../utils/format'

function NavItem({ item, onNavigate }) {
  const enabled = item.enabled !== false && Boolean(item.to)

  if (!enabled) {
    return (
      <li>
        <span className="nav-link disabled" aria-disabled="true" title="Not available yet">
          <span className="nav-icon">
            <Icon name={item.icon} size={17} />
          </span>
          {item.label}
          <span className="nav-soon">Soon</span>
        </span>
      </li>
    )
  }

  return (
    <li>
      <NavLink
        to={item.to}
        className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
        onClick={onNavigate}
      >
        <span className="nav-icon">
          <Icon name={item.icon} size={17} />
        </span>
        {item.label}
      </NavLink>
    </li>
  )
}

/**
 * Primary navigation. Rendered fixed on desktop and inside the drawer on
 * smaller screens; the active item always mirrors the current route.
 */
export default function Sidebar({ onNavigate, variant = 'fixed' }) {
  const { user } = useAuth()
  const items = navForRole(user?.role)

  return (
    <nav
      className={variant === 'drawer' ? 'drawer' : 'sidebar'}
      aria-label="Main navigation"
    >
      <div className="sidebar-brand">
        <Logo variant="light" />
        {variant === 'drawer' && (
          <button
            type="button"
            className="drawer-close"
            onClick={onNavigate}
            aria-label="Close menu"
          >
            <Icon name="close" size={17} />
          </button>
        )}
      </div>

      <p className="sidebar-role">{roleLabel(user?.role)} menu</p>

      <ul className="sidebar-nav">
        {items.map((item) => (
          <NavItem key={item.label} item={item} onNavigate={onNavigate} />
        ))}
      </ul>

      <div className="sidebar-footer">
        Kiwalan National High School
        <br />
        Iligan City, Philippines
      </div>
    </nav>
  )
}
