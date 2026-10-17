import { Link } from 'react-router-dom'
import Icon from '../Icon'

/** Grid of dashboard shortcuts. Items must point at real screens. */
export default function QuickActions({ actions }) {
  return (
    <div className="quick-actions">
      {actions.map((action) => (
        <Link key={action.label} className="quick-action" to={action.to}>
          <span className="qa-icon" aria-hidden="true">
            <Icon name={action.icon} size={16} />
          </span>
          {action.label}
        </Link>
      ))}
    </div>
  )
}
