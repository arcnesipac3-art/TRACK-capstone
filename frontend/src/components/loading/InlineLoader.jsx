import './loading.css'

/**
 * Small local indicator for a request that only affects one region
 * (a filter change, a card refresh, a dropdown opening).
 *
 * Announces itself politely so assistive technology learns that something is
 * pending without the whole page being replaced by a spinner.
 */
export default function InlineLoader({ label = 'Loading…', size = 'sm' }) {
  return (
    <span className="tr-inline-loader" role="status" aria-live="polite">
      <span className={`spinner spinner-${size}`} aria-hidden="true" />
      {label ? <span>{label}</span> : null}
    </span>
  )
}
