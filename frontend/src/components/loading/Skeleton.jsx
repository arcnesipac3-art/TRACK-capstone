import './loading.css'

/**
 * Generic skeleton primitive.
 *
 * Everything else in this folder is built from it, so shimmer timing, colour
 * and radius stay identical across the app. Always decorative: callers wrap a
 * group of these in a single announced status (see `label` on the composite
 * skeletons) rather than announcing every bar.
 *
 * - `width` / `height` / `radius`  → inline sizing (keeps layout stable)
 * - `lines`                        → a stack of text bars instead of one
 */
export default function Skeleton({
  width = '100%',
  height,
  radius,
  lines = 1,
  className = '',
  style,
}) {
  if (lines > 1) {
    return (
      <span
        className={`skeleton-stack ${className}`}
        style={style}
        aria-hidden="true"
      >
        {Array.from({ length: lines }, (_, i) => (
          <span
            key={i}
            className="skeleton skeleton-line"
            style={{
              width: i === lines - 1 ? '62%' : '100%',
              height,
              borderRadius: radius,
            }}
          />
        ))}
      </span>
    )
  }

  return (
    <span
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  )
}
