import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../Icon'
import EmptyState from '../EmptyState'
import Popover from '../Popover'
import ListSkeleton from '../loading/ListSkeleton'
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
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

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
    <Popover
      wrapClassName="bell-wrap"
      triggerClassName="bell-btn"
      triggerLabel={
        unreadCount > 0
          ? `Notifications, ${unreadCount} unread`
          : 'Notifications'
      }
      trigger={
        <>
          <Icon name="bell" size={18} />
          {unreadCount > 0 && (
            <span className="bell-count" aria-hidden="true">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </>
      }
      panelLabel="Notifications"
    >
      {({ close }) => (
        <>
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
            {loading && (
              <ListSkeleton items={3} lines={2} label="Loading notifications…" />
            )}

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
                  onClick={() => {
                    close()
                    openItem(item)
                  }}
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
                close()
                navigate('/notifications')
              }}
            >
              View all notifications
            </button>
          </div>
        </>
      )}
    </Popover>
  )
}
