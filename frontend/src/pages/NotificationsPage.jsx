import { useState } from 'react'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import LoadingSpinner from '../components/LoadingSpinner'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import api from '../services/api'
import useFetch from '../hooks/useFetch'
import { formatDateTime } from '../utils/format'

const TYPE_LABELS = {
  requirement_new: 'New requirement',
  deadline_approaching: 'Deadline',
  overdue: 'Overdue',
  submission_verified: 'Verified',
  submission_returned: 'Returned',
  attendance_absent: 'Absent',
  attendance_late: 'Late',
  announcement: 'Announcement',
}

export default function NotificationsPage() {
  const [busyId, setBusyId] = useState(null)
  const [allBusy, setAllBusy] = useState(false)
  const { data, loading, error, reload } = useFetch('/notifications/', {
    list: true,
    params: { page_size: 100 },
  })

  const items = data || []
  const unread = items.filter((item) => !item.is_read).length

  async function markRead(item) {
    if (item.is_read) return
    setBusyId(item.id)
    try {
      await api.patch(`/notifications/${item.id}/read/`, {})
      reload()
    } catch {
      /* keep the list usable even if the call fails */
    } finally {
      setBusyId(null)
    }
  }

  async function markAll() {
    setAllBusy(true)
    try {
      await api.post('/notifications/read-all/', {})
      reload()
    } catch {
      /* ignore */
    } finally {
      setAllBusy(false)
    }
  }

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Notifications"
        subtitle={
          unread > 0
            ? `You have ${unread} unread notification${unread === 1 ? '' : 's'}.`
            : 'Everything is read.'
        }
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={markAll}
            disabled={allBusy || unread === 0}
          >
            {allBusy ? 'Working…' : 'Mark all as read'}
          </button>
        }
      />

      <section className="card">
        {loading && <LoadingSpinner block label="Loading notifications…" />}

        {!loading && error && (
          <div className="card-body">
            <ErrorMessage
              error={error}
              title="Could not load notifications"
              onRetry={reload}
            />
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="card-body">
            <EmptyState
              icon="bell"
              title="No notifications"
              message="Requirement, submission and attendance updates will appear here."
            />
          </div>
        )}

        {!loading &&
          !error &&
          items.map((item) => (
            <div
              className="list-card"
              key={item.id}
              style={{
                background: item.is_read ? 'transparent' : 'var(--blue-50)',
              }}
            >
              <div className="row row-between row-wrap">
                <div className="grow stack stack-xs">
                  <span className="list-card-title">{item.title}</span>
                  {item.body && (
                    <span className="muted" style={{ fontSize: '0.87rem' }}>
                      {item.body}
                    </span>
                  )}
                  <span className="subtle">
                    {formatDateTime(item.created_at)}
                  </span>
                </div>
                <div className="row">
                  <StatusBadge
                    label={TYPE_LABELS[item.notif_type] || item.notif_type}
                    tone={item.is_read ? 'neutral' : 'blue'}
                  />
                  {!item.is_read && (
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => markRead(item)}
                      disabled={busyId === item.id}
                    >
                      {busyId === item.id ? 'Saving…' : 'Mark read'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
      </section>
    </div>
  )
}
