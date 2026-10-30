import Icon from './Icon'

/**
 * Centered empty/error placeholder. The title renders as a heading so it
 * reads as a section in the accessibility tree; pass `as="h2"` when the
 * block sits directly under a page <h1> so heading levels don't skip.
 */
export default function EmptyState({
  icon = 'inbox',
  title = 'Nothing here yet',
  message,
  action,
  as: Heading = 'h3',
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <Heading>{title}</Heading>
      {message && <p>{message}</p>}
      {action}
    </div>
  )
}
