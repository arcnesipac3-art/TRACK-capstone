import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../Icon'
import Popover from '../Popover'
import { useAuth } from '../../context/AuthContext'
import { initials, roleLabel } from '../../utils/format'

export default function UserProfileMenu() {
  const { user, logout } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const navigate = useNavigate()

  async function handleLogout() {
    setSigningOut(true)
    await logout()
    navigate('/login', { replace: true })
  }

  if (!user) return null

  return (
    <Popover
      wrapClassName="user-menu-wrap"
      triggerClassName="user-menu-btn"
      trigger={
        <>
          <span className="avatar" aria-hidden="true">
            {initials(user.fullName)}
          </span>
          <span className="user-name">{user.fullName}</span>
          <Icon name="chevronDown" size={15} />
        </>
      }
      panelClassName="popover user-menu-pop"
      panelRole="menu"
      panelLabel="Account"
    >
      {({ close }) => (
        <>
          <div className="menu-identity">
            <div className="mi-name">{user.fullName}</div>
            <div className="mi-meta">
              {roleLabel(user.role)} · {user.username}
            </div>
          </div>

          <Link className="menu-link" role="menuitem" to="/profile" onClick={close}>
            <Icon name="user" size={16} />
            My profile
          </Link>
          <Link className="menu-link" role="menuitem" to="/notifications" onClick={close}>
            <Icon name="bell" size={16} />
            Notifications
          </Link>
          <Link className="menu-link" role="menuitem" to="/" onClick={close}>
            <Icon name="home" size={16} />
            Visit website
          </Link>
          <button
            type="button"
            className="menu-link danger"
            role="menuitem"
            onClick={handleLogout}
            disabled={signingOut}
          >
            <Icon name="logout" size={16} />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </>
      )}
    </Popover>
  )
}
