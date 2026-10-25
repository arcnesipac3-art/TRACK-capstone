import { Link } from 'react-router-dom'
import Icon from '../Icon'

/**
 * Grid of dashboard shortcuts. Items must point at real screens and callers
 * filter them by permission first — the grid is sized for comfortable
 * touch/click targets rather than a single packed row.
 */
export default function QuickActions({ actions }) {
  return (
    <nav className="quick-actions" aria-label="Quick actions">
      {actions.map((action) => (
        <Link key={action.label} className="quick-action" to={action.to}>
          <span className="qa-icon" aria-hidden="true">
            <Icon name={action.icon} size={18} />
          </span>
          <span className="qa-label">{action.label}</span>
        </Link>
      ))}
    </nav>
  )
}
