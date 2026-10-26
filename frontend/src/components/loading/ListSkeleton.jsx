import './loading.css'

/**
 * Vertical list placeholder — recent activity, notifications, announcements,
 * class rosters and any other row-per-item feed.
 *
 * `label` is announced once; the rows themselves are decorative so a screen
 * reader hears "Loading notifications…" instead of a wall of empty boxes.
 */
export default function ListSkeleton({
  items = 4,
  lines = 2,
  avatar = false,
  label,
  className = '',
}) {
  return (
    <>
      {label && (
        <span className="sr-only" role="status" aria-live="polite">
          {label}
        </span>
      )}
      <div
        className={`tr-list-skeleton skeleton ${className}`}
        aria-hidden="true"
      >
        {Array.from({ length: items }, (_, i) => (
          <div className="tr-list-row" key={i}>
            {avatar && <span className="sk-bar sk-bar-avatar" />}
            <span className="tr-list-lines">
              {Array.from({ length: lines }, (_, l) => (
                <span
                  key={l}
                  className={`sk-bar sk-bar-body${l === lines - 1 ? ' is-short' : ''}`}
                />
              ))}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}
