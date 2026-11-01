import { Link } from 'react-router-dom'
import Icon from '../Icon'
import { formatNumber } from '../../utils/format'

/** Placeholder bars while a section's fetch is in flight. */
export function CtxSkeleton({ rows = 2 }) {
  return (
    <>
      <span className="sr-only" role="status">
        Loading…
      </span>
      <div className="ctx-skeleton" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div className="skeleton ctx-skeleton-row" key={i} />
        ))}
      </div>
    </>
  )
}

/**
 * One compact task/figure row: icon, label, value chip; the whole row links
 * when a destination is given. Zero counts render dimmed — they stay visible
 * so the list reads as a checklist, not as missing data.
 */
export function CtxRow({ icon, label, value, tone, to }) {
  const body = (
    <>
      <span className={`ctx-row-icon${tone ? ` ${tone}` : ''}`} aria-hidden="true">
        <Icon name={icon} size={14} />
      </span>
      <span className="ctx-row-label">{label}</span>{' '}
      <span className="ctx-row-value">{value}</span>
    </>
  )

  if (to) {
    return (
      <Link className="ctx-row" to={to}>
        {body}
      </Link>
    )
  }
  return <div className="ctx-row">{body}</div>
}

/** Plain two-line row used for feeds (title + meta) inside the panel. */
export function CtxFeedRow({ title, meta, to }) {
  const content = (
    <>
      <div className="ctx-feed-title">{title}</div>
      {meta ? <div className="ctx-feed-meta">{meta}</div> : null}
    </>
  )
  if (to) {
    return (
      <Link className="ctx-feed-row" to={to}>
        {content}
      </Link>
    )
  }
  return <div className="ctx-feed-row">{content}</div>
}

/** Count chip that keeps zero honest. */
export function CtxCount({ value }) {
  return (
    <span className={Number(value) > 0 ? 'ctx-count' : 'ctx-count zero'}>
      {formatNumber(value)}
    </span>
  )
}
