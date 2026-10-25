import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../Icon'
import { useAuth } from '../../context/AuthContext'
import { initials, roleLabel } from '../../utils/format'

export default function UserProfileMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const wrapRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return undefined
    const onDocClick = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function handleLogout() {
    setSigningOut(true)
    await logout()
    navigate('/login', { replace: true })
  }

  if (!user) return null

  return (
    <div className="user-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="user-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="avatar" aria-hidden="true">
          {initials(user.fullName)}
        </span>
        <span className="user-name">{user.fullName}</span>
        <Icon name="chevronDown" size={15} />
      </button>

      {open && (
        <div className="popover user-menu-pop" role="menu">
          <div className="menu-identity">
            <div className="mi-name">{user.fullName}</div>
            <div className="mi-meta">
              {roleLabel(user.role)} · {user.username}
            </div>
          </div>

          <Link className="menu-link" role="menuitem" to="/profile"
            onClick={() => setOpen(false)}>
            <Icon name="user" size={16} />
            My profile
          </Link>
          <Link className="menu-link" role="menuitem" to="/notifications"
            onClick={() => setOpen(false)}>
            <Icon name="bell" size={16} />
            Notifications
          </Link>
          <Link className="menu-link" role="menuitem" to="/"
            onClick={() => setOpen(false)}>
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
        </div>
      )}
    </div>
  )
}
