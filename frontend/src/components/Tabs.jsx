/**
 * Segmented tab strip — the one tabbed control the management screens share.
 *
 * Follows the WAI-ARIA tabs pattern: one tab is in the tab order at a time and
 * the arrow keys move the selection with it, so a keyboard user traverses the
 * strip the way a screen reader announces it.
 *
 * `tabs` is `[{ id, label }]`; the panel each tab controls must carry the
 * matching `aria-controls` id (`${idPrefix}-panel-${id}`).
 */
export default function Tabs({ tabs, value, onChange, label, idPrefix = 'tabs', className = '' }) {
  function onKeyDown(event, index) {
    const last = tabs.length - 1
    let next = null
    if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1
    else if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    if (next === null) return
    event.preventDefault()
    const target = tabs[next]
    onChange(target.id)
    document.getElementById(`${idPrefix}-tab-${target.id}`)?.focus()
  }

  return (
    <div className={`tabs${className ? ` ${className}` : ''}`} role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${tab.id}`}
          aria-controls={`${idPrefix}-panel-${tab.id}`}
          aria-selected={value === tab.id}
          tabIndex={value === tab.id ? 0 : -1}
          className={`tab${value === tab.id ? ' active' : ''}`}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
