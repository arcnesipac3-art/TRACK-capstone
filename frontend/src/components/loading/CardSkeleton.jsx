import Skeleton from './Skeleton'
import './loading.css'

/**
 * Panel placeholder for a chart, overview or summary card: title bar plus
 * body lines, inside the real `.card` shell so the header and border land
 * exactly where they will when the data arrives.
 *
 * `lines={0}` swaps the body for a single block (a chart area).
 */
export default function CardSkeleton({
  lines = 3,
  blockHeight,
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
      <section className={`card ${className}`} aria-hidden="true">
        <header className="card-header">
          <span className="sk-bar sk-bar-title" />
        </header>
        <div className="card-body">
          {lines > 0 ? (
            <div className="tr-card-skeleton-body">
              <Skeleton lines={lines} height={12} />
            </div>
          ) : (
            <span
              className="skeleton skeleton-block"
              style={blockHeight ? { height: blockHeight } : undefined}
            />
          )}
        </div>
      </section>
    </>
  )
}
