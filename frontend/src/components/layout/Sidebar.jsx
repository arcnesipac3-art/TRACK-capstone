import { useId, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import Icon from '../Icon'
import Logo from '../Logo'
import { navForUser } from '../../config/navigation'
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
 * Collapsible navigation group (Users → Students / Teachers / Parents).
 *
 * The row itself is a toggle button, not a link: it expands or collapses the
 * submenu instead of navigating. It auto-expands whenever the current route
 * belongs to one of its children and stays expanded while moving between
 * them; collapsing is always an explicit user action.
 */
function NavGroup({ item, onNavigate }) {
  const { pathname } = useLocation()
  const children = item.children || []
  const childActive = children.some((child) => child.to && pathname.startsWith(child.to))
  // The group's own route (e.g. /admin/users) reads as active only when no
  // child is selected, so parent and child never look selected at once.
  const selfActive = Boolean(item.to) && pathname.startsWith(item.to) && !childActive

  const [open, setOpen] = useState(childActive)
  const [prevChildActive, setPrevChildActive] = useState(childActive)
  const panelId = useId()

  // Auto-expand when the route moves under this group. Deliberately never
  // auto-collapses: once open, only the user closes it. Adjusting state during
  // render (rather than in an effect) avoids a wasted intermediate render —
  // see react.dev/learn/you-might-not-need-an-effect.
  if (childActive !== prevChildActive) {
    setPrevChildActive(childActive)
    if (childActive) setOpen(true)
  }

  return (
    <li>
      <button
        type="button"
        className={[
          'nav-link',
          'nav-group-toggle',
          open ? 'expanded' : '',
          selfActive ? 'active' : '',
          childActive ? 'child-active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className="nav-icon">
          <Icon name={item.icon} size={17} />
        </span>
        {item.label}
        <Icon name="chevronDown" size={15} className={`nav-chevron${open ? ' open' : ''}`} />
      </button>

      <div className={`nav-submenu${open ? ' open' : ''}`} id={panelId}>
        <ul className="nav-submenu-inner">
          {children.map((child) => (
            <li key={child.to}>
              <NavLink
                to={child.to}
                className={({ isActive }) => `nav-link nav-sub${isActive ? ' active' : ''}`}
                onClick={onNavigate}
              >
                <span className="nav-icon">
                  <Icon name={child.icon} size={14} />
                </span>
                {child.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </li>
  )
}

/**
 * Primary navigation. Rendered fixed on desktop and inside the drawer on
 * smaller screens; the active item always mirrors the current route.
 */
export default function Sidebar({ onNavigate, variant = 'fixed' }) {
  const { user } = useAuth()
  const items = navForUser(user)

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
        {items.map((item) =>
          item.children?.length ? (
            <NavGroup key={item.label} item={item} onNavigate={onNavigate} />
          ) : (
            <NavItem key={item.label} item={item} onNavigate={onNavigate} />
          )
        )}
      </ul>

      <div className="sidebar-footer">
        Kiwalan National High School
        <br />
        Iligan City, Philippines
      </div>
    </nav>
  )
}
