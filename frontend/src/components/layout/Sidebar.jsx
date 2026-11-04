import { useId, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import Icon from '../Icon'
import Logo from '../Logo'
import { navForUser } from '../../config/navigation'
import { useAuth } from '../../context/AuthContext'
import { roleLabel } from '../../utils/format'

function NavItem({ item, rail, onNavigate }) {
  const enabled = item.enabled !== false && Boolean(item.to)

  if (!enabled) {
    return (
      <li>
        <span
          className="nav-link disabled"
          aria-disabled="true"
          title={rail ? item.label : 'Not available yet'}
        >
          <span className="nav-icon">
            <Icon name={item.icon} size={17} />
          </span>
          <span className="nav-label">{item.label}</span>
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
        title={rail ? item.label : undefined}
        onClick={onNavigate}
      >
        <span className="nav-icon">
          <Icon name={item.icon} size={17} />
        </span>
        <span className="nav-label">{item.label}</span>
      </NavLink>
    </li>
  )
}

/**
 * Collapsible navigation group (Users → Students / Teachers / Parents).
 *
 * The row itself is a toggle button, not a link: it expands or collapses the
 * submenu instead of navigating. Groups have no page of their own — the
 * breadcrumb shows their label as plain text for the same reason — so the only
 * highlight a group can carry is the `child-active` cue. It auto-expands
 * whenever the current route belongs to one of its children and stays
 * expanded while moving between them; collapsing is always an explicit action.
 *
 * In the collapsed rail there is no room for a submenu, so toggling a group
 * widens the sidebar back open and reveals it there.
 */
function NavGroup({ item, rail, onOpenRail, onNavigate }) {
  const { pathname } = useLocation()
  const children = item.children || []
  const childActive = children.some((child) => child.to && pathname.startsWith(child.to))

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

  function toggle() {
    if (rail) {
      onOpenRail?.()
      setOpen(true)
      return
    }
    setOpen((wasOpen) => !wasOpen)
  }

  return (
    <li>
      <button
        type="button"
        className={[
          'nav-link',
          'nav-group-toggle',
          open ? 'expanded' : '',
          childActive ? 'child-active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-expanded={open}
        aria-controls={panelId}
        title={rail ? item.label : undefined}
        onClick={toggle}
      >
        <span className="nav-icon">
          <Icon name={item.icon} size={17} />
        </span>
        <span className="nav-label">{item.label}</span>
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
                <span className="nav-label">{child.label}</span>
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
 *
 * On desktop it also collapses to an icon rail (`rail`), which keeps the
 * current page highlighted but drops every label.
 */
export default function Sidebar({
  onNavigate,
  variant = 'fixed',
  rail = false,
  exiting = false,
  onToggleRail,
}) {
  const { user } = useAuth()
  const items = navForUser(user)
  const collapsed = rail && variant === 'fixed'

  return (
    <nav
      className={
        variant === 'drawer'
          ? `drawer${exiting ? ' drawer-out' : ''}`
          : `sidebar${collapsed ? ' rail' : ''}`
      }
      inert={exiting || undefined}
      aria-label="Main navigation"
    >
      <div className="sidebar-brand">
        {collapsed ? (
          <img
            className="sidebar-rail-mark"
            src="/favicon.png"
            alt="TRACK"
            width="32"
            height="32"
          />
        ) : (
          <Logo variant="light" />
        )}
        {variant === 'drawer' ? (
          <button
            type="button"
            className="drawer-close"
            onClick={onNavigate}
            aria-label="Close menu"
          >
            <Icon name="close" size={17} />
          </button>
        ) : (
          <button
            type="button"
            className="sidebar-collapse"
            onClick={() => onToggleRail?.(!collapsed)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            <Icon name={collapsed ? 'arrowRight' : 'arrowLeft'} size={16} />
          </button>
        )}
      </div>

      <p className="sidebar-role">{roleLabel(user?.role)} menu</p>

      <ul className="sidebar-nav">
        {items.map((item) =>
          item.children?.length ? (
            <NavGroup
              key={item.label}
              item={item}
              rail={collapsed}
              onOpenRail={() => onToggleRail?.(false)}
              onNavigate={onNavigate}
            />
          ) : (
            <NavItem key={item.label} item={item} rail={collapsed} onNavigate={onNavigate} />
          )
        )}
      </ul>

      <div className="sidebar-footer">
        <img
          src="/knhs-seal.png"
          alt=""
          aria-hidden="true"
          className="sidebar-knhs-seal"
        />
        <div>
          Purok 10 Mato-og, Kiwalan
          <br />
          Iligan City, Philippines
        </div>
      </div>
    </nav>
  )
}
