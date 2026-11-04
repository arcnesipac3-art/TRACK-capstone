import Icon from '../Icon'

/**
 * Reusable right-hand contextual column of the three-column shell.
 *
 * Rendered by `AppLayout` in two variants:
 *  - `inline`: a fixed column beside the workspace on ≥1024px viewports;
 *    collapsing it is an explicit action (chevron) and the preference persists.
 *  - `drawer`: a slide-over on tablet/mobile, dismissed by the overlay, the
 *    close button, Escape or any navigation.
 *
 * Content comes from the route registry in `components/context/registry.js`;
 * routes without contextual content render no panel at all.
 */
export default function ContextPanel({
  title,
  children,
  variant = 'inline',
  open = true,
  exiting = false,
  onCollapse,
  onClose,
}) {
  const drawer = variant === 'drawer'

  return (
    <aside
      className={[
        'context-panel',
        drawer ? 'context-drawer' : '',
        drawer && exiting ? 'context-drawer-out' : '',
        !drawer && !open ? 'context-closed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`${title} — contextual information`}
      aria-hidden={!open}
      inert={exiting || undefined}
      role="complementary"
    >
      <div className="context-head">
        <h2 className="context-title">{title}</h2>
        {drawer ? (
          <button
            type="button"
            className="context-close"
            onClick={onClose}
            aria-label="Close context panel"
          >
            <Icon name="close" size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="context-collapse"
            onClick={onCollapse}
            tabIndex={open ? 0 : -1}
            aria-expanded={open}
            aria-label="Collapse context panel"
          >
            <Icon name="arrowRight" size={16} />
          </button>
        )}
      </div>
      <div className="context-body">{children}</div>
    </aside>
  )
}

/**
 * One labelled block inside the context panel. Sections are deliberately
 * lighter than dashboard `Card`s — the column is sidebar-wide and stacks
 * several of these, so headers are compact micro-labels with an optional
 * inline action.
 */
export function PanelSection({ title, action, children }) {
  return (
    <section className="ctx-section" aria-label={title}>
      <div className="ctx-section-head">
        <h3 className="ctx-section-title">{title}</h3>
        {action ? <div className="ctx-section-action">{action}</div> : null}
      </div>
      <div className="ctx-section-body">{children}</div>
    </section>
  )
}
