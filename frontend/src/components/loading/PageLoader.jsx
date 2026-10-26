import './loading.css'

/**
 * Blocking page-level loader — used when a screen genuinely cannot render
 * anything useful until the request lands (a detail page before its record,
 * a lazy route chunk inside the shell).
 *
 * `minHeight` reserves the space the content will occupy so the surrounding
 * layout does not jump when the real view replaces the loader.
 */
export default function PageLoader({
  label = 'Loading…',
  size = 'lg',
  minHeight,
  className = '',
}) {
  return (
    <div
      className={`loading-block ${className}`}
      role="status"
      aria-live="polite"
      style={minHeight ? { minHeight } : undefined}
    >
      <span className={`spinner spinner-${size}`} aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}
