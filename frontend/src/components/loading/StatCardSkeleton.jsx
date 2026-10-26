import './loading.css'

/**
 * Placeholder for one dashboard metric card.
 *
 * The root carries both `stat-card` (same box, padding and min-height as the
 * real card, so nothing shifts) and `skeleton` (one shimmering element), with
 * plain bars inside to suggest the label, value and hint.
 */
export default function StatCardSkeleton() {
  return (
    <div className="stat-card skeleton skeleton-stat" aria-hidden="true">
      <span className="sk-bar sk-bar-label" />
      <span className="sk-bar sk-bar-value" />
      <span className="sk-bar sk-bar-hint" />
    </div>
  )
}
