import { Link } from 'react-router-dom'
import Icon from './Icon'

/**
 * Headline metric card used across the four dashboards.
 *
 * `icon` is optional — cards render fine without it, so screens that predate
 * the icon treatment are unchanged. Long values (formatted currency like
 * "₱1,234,567.89") drop to a smaller size so they never overflow the card.
 * `to` turns the whole card into a link; callers pass it only when the metric
 * has a real destination screen.
 */
export default function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  icon,
  to,
  className = '',
}) {
  const longValue = typeof value === 'string' && value.length > 11
  const classes = [
    'stat-card',
    tone !== 'default' && `tone-${tone}`,
    to && 'stat-card-link',
    className,
  ].filter(Boolean).join(' ')

  const body = (
    <>
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
    </>
  )

  if (to) {
    return (
      <Link className={classes} to={to}>
        {body}
      </Link>
    )
  }
  return <div className={classes}>{body}</div>
}
