import Icon from './Icon'

/**
 * Headline metric card used across the four dashboards.
 *
 * `icon` is optional — cards render fine without it, so screens that predate
 * the icon treatment are unchanged. Long values (formatted currency like
 * "₱1,234,567.89") drop to a smaller size so they never overflow the card.
 */
export default function StatCard({ label, value, hint, tone = 'default', icon }) {
  const longValue = typeof value === 'string' && value.length > 11
  return (
    <div className={`stat-card ${tone !== 'default' ? `tone-${tone}` : ''}`}>
      {icon ? (
        <span className="stat-top">
          <span className="stat-icon" aria-hidden="true">
            <Icon name={icon} size={16} />
          </span>
          <span className="stat-label">{label}</span>
        </span>
      ) : (
        <span className="stat-label">{label}</span>
      )}
      <span className={`stat-value${longValue ? ' is-long' : ''}`}>{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  )
}
