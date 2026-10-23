import { Link } from 'react-router-dom'
import Card from './Card'
import EmptyState from '../EmptyState'
import useFetch from '../../hooks/useFetch'
import { formatRelative } from '../../utils/format'

/** Recent notifications for the signed-in user (newest five). */
export default function NotificationsCard({ limit = 5 }) {
  const { data, loading, error, reload } = useFetch('/notifications/', {
    list: true,
    params: { page_size: 100 },
  })

  const items = (data || []).slice(0, limit)
  const unread = (data || []).filter((item) => !item.is_read).length

  return (
    <Card
      title="Recent notifications"
      loading={loading}
      error={error}
      onRetry={reload}
      empty={
        !loading && !error && items.length === 0 ? (
          <EmptyState
            icon="bell"
            title="No notifications yet"
            message="Requirement updates, verification results and attendance alerts will show up here."
          />
        ) : null
      }
      action={
        <div className="row row-wrap" style={{ gap: 6 }}>
          {unread > 0 && (
            <span className="badge badge-blue" title={`${unread} unread notifications`}>
              {unread} new
            </span>
          )}
          <Link className="btn btn-sm btn-ghost" to="/notifications">
            View all
          </Link>
        </div>
      }
    >
      <div className="activity-list">
        {items.map((item) => (
          <div className="activity-item" key={item.id} style={{ padding: '10px 0' }}>
            <span
              className="activity-dot"
              aria-hidden="true"
              style={{
                background: item.is_read ? 'var(--border-strong)' : 'var(--blue-600)',
              }}
            />
            <div className="grow">
              <div className="ai-title">{item.title}</div>
              <div className="ai-meta">
                {formatRelative(item.created_at)}
                {item.is_read ? '' : ' · unread'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
