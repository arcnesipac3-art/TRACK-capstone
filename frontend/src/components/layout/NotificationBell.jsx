import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../Icon'
import EmptyState from '../EmptyState'
import LoadingSpinner from '../LoadingSpinner'
import api from '../../services/api'
import { formatRelative } from '../../utils/format'

/**
 * Bell with unread badge + popover listing the user's latest notifications.
 * Only ever shows notifications the backend returned for this user.
 */
export default function NotificationBell({
  items,
  loading,
  unreadCount,
  onChanged,
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
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

  const latest = (items || []).slice(0, 6)

  async function openItem(item) {
    if (!item.is_read) {
      try {
        await api.patch(`/notifications/${item.id}/read/`, {})
        onChanged?.()
      } catch {
        /* navigation still proceeds */
      }
    }
    setOpen(false)
    navigate('/notifications')
  }

  async function markAll() {
    setBusy(true)
    try {
      await api.post('/notifications/read-all/', {})
      onChanged?.()
    } catch {
      /* ignore — the list simply will not refresh */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="bell-btn"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : 'Notifications'
        }
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="bell" size={18} />
        {unreadCount > 0 && (
          <span className="bell-count" aria-hidden="true">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="popover" role="dialog" aria-label="Notifications">
          <div className="popover-head">
            <h3>Notifications</h3>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={markAll}
              disabled={busy || unreadCount === 0}
            >
              {busy ? 'Working…' : 'Mark all read'}
            </button>
          </div>

          <div className="popover-list">
            {loading && <LoadingSpinner block label="Loading notifications…" />}

            {!loading && latest.length === 0 && (
              <EmptyState
                icon="bell"
                title="No notifications"
                message="Updates about requirements, submissions and attendance will appear here."
              />
            )}

            {!loading &&
              latest.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`notif-item${item.is_read ? '' : ' unread'}`}
                  onClick={() => openItem(item)}
                >
                  <span className="notif-title">
                    {item.is_read ? '' : '● '}
                    {item.title}
                  </span>
                  {item.body && <span className="notif-body">{item.body}</span>}
                  <span className="notif-time">{formatRelative(item.created_at)}</span>
                </button>
              ))}
          </div>

          <div className="popover-foot">
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setOpen(false)
                navigate('/notifications')
              }}
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
