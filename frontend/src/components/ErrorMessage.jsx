import Icon from './Icon'
import Button from '../components/Button'

/**
 * Consistent error display with an optional retry action.
 * `error` may be an ApiError (with .message/.status) or a plain string.
 */
export default function ErrorMessage({
  error,
  title = 'Something went wrong',
  onRetry,
  compact = false,
}) {
  const message =
    typeof error === 'string'
      ? error
      : error?.message || 'Unexpected error while contacting the server.'

  if (compact) {
    return (
      <div className="alert alert-error" role="alert">
        <Icon name="info" size={17} />
        <div className="grow">
          <span>{message}</span>
        </div>
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="alert alert-error" role="alert">
      <Icon name="info" size={18} />
      <div className="grow stack stack-xs">
        <strong className="alert-title">{title}</strong>
        <span>{message}</span>
        {onRetry && (
          <div>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              <Icon name="refresh" size={14} />
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
