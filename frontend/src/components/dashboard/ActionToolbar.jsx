import { Link } from 'react-router-dom'
import Icon from '../Icon'
import Popover from '../Popover'
import './ActionToolbar.css'

/**
 * Compact dashboard shortcut bar.
 *
 * The busiest destinations stay as buttons in one row and the rest fold into
 * an accessible "More actions" menu, so a dashboard with ten shortcuts does
 * not spend half its height on navigation. Callers pass actions already
 * filtered by permission — this component never decides who may see a route.
 */
export default function ActionToolbar({ primary = [], more = [] }) {
  if (primary.length === 0 && more.length === 0) return null

  return (
    <nav className="action-bar" aria-label="Quick actions">
      {primary.map((action) => (
        <Link className="action-bar-btn" key={action.to} to={action.to}>
          <Icon name={action.icon} size={15} />
          <span>{action.label}</span>
        </Link>
      ))}

      {more.length > 0 && (
        <Popover
          trigger={
            <>
              <span>More actions</span>
              <Icon name="chevronDown" size={14} />
            </>
          }
          triggerClassName="action-bar-btn action-bar-more"
          wrapClassName="action-bar-wrap"
          triggerLabel="More actions"
          panelClassName="popover action-bar-panel"
          panelRole="menu"
          panelLabel="More dashboard actions"
        >
          {({ close }) => (
            <div className="action-bar-menu">
              {more.map((action) => (
                <Link
                  className="action-bar-item"
                  key={action.to}
                  to={action.to}
                  role="menuitem"
                  onClick={close}
                >
                  <Icon name={action.icon} size={15} />
                  <span>{action.label}</span>
                </Link>
              ))}
            </div>
          )}
        </Popover>
      )}
    </nav>
  )
}
