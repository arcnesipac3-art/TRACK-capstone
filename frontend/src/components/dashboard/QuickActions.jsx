import { Link } from 'react-router-dom'
import Icon from '../Icon'

/**
 * Grid of dashboard shortcuts. Items must point at real screens and callers
 * filter them by permission first — the grid is sized for comfortable
 * touch/click targets rather than a single packed row.
 *
 * `primary: true` renders the item as the row's main action so a bar of equal
 * buttons still carries a hierarchy; callers that do not set it render exactly
 * as before.
 */
export default function QuickActions({ actions }) {
  return (
    <nav className="quick-actions" aria-label="Quick actions">
      {actions.map((action) => (
        <Link
          key={action.label}
          className={`quick-action${action.primary ? ' is-primary' : ''}`}
          to={action.to}
        >
          <span className="qa-icon" aria-hidden="true">
            <Icon name={action.icon} size={18} />
          </span>
          <span className="qa-label">{action.label}</span>
        </Link>
      ))}
    </nav>
  )
}
