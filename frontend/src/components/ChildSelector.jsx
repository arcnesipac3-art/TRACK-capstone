/** Pill selector used by parent screens when a parent has several children. */
export default function ChildSelector({ items = [], selectedId, onSelect }) {
  if (items.length < 2) return null

  return (
    <div className="child-selector" role="tablist" aria-label="Select child">
      {items.map((child) => (
        <button
          key={child.student_id}
          type="button"
          role="tab"
          aria-selected={selectedId === child.student_id}
          className={`child-chip${selectedId === child.student_id ? ' active' : ''}`}
          onClick={() => onSelect(child.student_id)}
        >
          {child.name}
          {child.section && <span className="chip-section">{child.section}</span>}
        </button>
      ))}
    </div>
  )
}
