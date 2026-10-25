export default function LoadingSpinner({
  label = 'Loading…',
  size = 'md',
  block = false,
}) {
  if (block) {
    return (
      <div className="loading-block" role="status" aria-live="polite">
        <span className={`spinner spinner-${size}`} aria-hidden="true" />
        <span>{label}</span>
      </div>
    )
  }
  return (
    <span
      className="row"
      role="status"
      aria-live="polite"
      style={{ gap: 8, color: 'var(--text-muted)', fontSize: '0.88rem' }}
    >
      <span className={`spinner spinner-${size}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}
