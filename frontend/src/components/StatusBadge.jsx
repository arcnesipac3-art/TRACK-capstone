/**
 * Status pill. Every status shows a glyph *and* a text label so meaning is
 * never carried by colour alone.
 */
export default function StatusBadge({ label, tone = 'neutral', title, className = '' }) {
  return (
    <span className={`badge badge-${tone}${className ? ` ${className}` : ''}`} title={title}>
      {label}
    </span>
  )
}
