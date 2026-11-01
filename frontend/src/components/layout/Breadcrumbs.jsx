import { Link } from 'react-router-dom'

/**
 * Breadcrumb trail under the page title in the topbar.
 *
 * Shows the path *above* the current page (Dashboard → Users), never the page
 * itself — the title line already says where you are, and repeating it as the
 * last crumb adds noise, not context. A trail with nothing above it (the
 * dashboard, or a page that is not in the role's navigation) renders nothing.
 *
 * A crumb without `to` is a container (the Users group, which has no page of
 * its own): it names the section as plain text.
 */
export default function Breadcrumbs({ trail }) {
  const ancestors = (trail || []).slice(0, -1)
  if (ancestors.length === 0) return null

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {ancestors.map((crumb) => (
          <li key={crumb.to || crumb.label}>
            {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span>{crumb.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  )
}
