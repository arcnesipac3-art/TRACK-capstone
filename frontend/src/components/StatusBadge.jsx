/**
 * Status pill. Every status shows a glyph *and* a text label so meaning is
 * never carried by colour alone.
 */
export default function StatusBadge({ label, tone = 'neutral', title }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {label}
    </span>
  )
}
