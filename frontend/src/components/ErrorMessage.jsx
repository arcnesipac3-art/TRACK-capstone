import Icon from './Icon'

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
          <button type="button" className="btn btn-sm btn-secondary" onClick={onRetry}>
            Retry
          </button>
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
            <button type="button" className="btn btn-sm btn-secondary" onClick={onRetry}>
              <Icon name="refresh" size={14} />
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
