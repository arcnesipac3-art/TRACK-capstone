import Skeleton from '../loading/Skeleton'
import Button from '../../components/Button'

/** Horizontal progress rows: label · value · bar (used for status overviews). */
export function SummaryRows({ rows }) {
  return (
    <div>
      {rows.map((row) => {
        // Percentages always use the raw numeric `value`; `display` (when
        // given) only changes what is rendered, so comma-formatted counts
        // like "1,234" never poison the maths.
        const pct = row.total > 0 ? Math.round((row.value / row.total) * 100) : 0
        return (
          <div className="progress-row" key={row.label}>
            <div className="pr-top">
              <span className="pr-label">{row.label}</span>
              <span className="pr-value">
                {row.display ?? row.value}
                {row.showPercent ? ` · ${pct}%` : ''}
              </span>
            </div>
            <div
              className="progress-track"
              role="img"
              aria-label={`${row.label}: ${row.value} of ${row.total}`}
            >
              <div
                className={`progress-fill ${row.tone || 'blue'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Card wrapper that shows loading / error / content consistently. */
export default function Card({
  title,
  action,
  children,
  loading,
  error,
  onRetry,
  empty,
  flush = false,
  ...rest
}) {
  return (
    <section className="card" {...rest}>
      {(title || action) && (
        <header className="card-header">
          <h2>{title}</h2>
          {action}
        </header>
      )}
      <div className={`card-body${flush ? ' flush' : ''}`}>
        {loading && <LoadingBlock />}
        {!loading && error && (
          <div className="alert alert-error" role="alert">
            <span className="grow">{error.message || String(error)}</span>
            {onRetry && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onRetry}
              >
                Retry
              </Button>
            )}
          </div>
        )}
        {!loading && !error && empty && empty}
        {!loading && !error && !empty && children}
      </div>
    </section>
  )
}

function LoadingBlock() {
  return <Skeleton lines={3} height={12} />
}
