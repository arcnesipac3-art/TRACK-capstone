import Icon from './Icon'

export default function EmptyState({
  icon = 'inbox',
  title = 'Nothing here yet',
  message,
  action,
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  )
}
