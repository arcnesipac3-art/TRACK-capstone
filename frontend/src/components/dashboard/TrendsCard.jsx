import { useId } from 'react'
import Card from './Card'
import { formatCurrency } from '../../utils/format'

/**
 * Monthly collection and enrollment trends, drawn as inline SVG bars.
 *
 * No chart library: one <svg> per series, one <rect> per month, each with
 * a native <title> tooltip. The bars are decorative (the <svg> carries a
 * text summary in its aria-label); a visually hidden table repeats every
 * number for screen readers.
 */
export default function TrendsCard({ months, loading, error, onRetry }) {
  const rows = months || []
  const totalCollected = rows.reduce((sum, m) => sum + m.collected, 0)
  const totalEnrollments = rows.reduce((sum, m) => sum + m.enrollments, 0)
  const hasPayments = rows.some((m) => m.payments > 0)
  const hasEnrollments = rows.some((m) => m.enrollments > 0)
  const tableId = useId()

  return (
    <Card
      title="Trends · last 12 months"
      loading={loading}
      error={error}
      onRetry={onRetry}
    >
      <div className="trend-grid">
        <section className="trend-section">
          <div className="trend-head">
            <h3>Fee collection</h3>
            <span className="trend-total">{formatCurrency(totalCollected)} collected</span>
          </div>
          {hasPayments ? (
            <BarChart
              rows={rows}
              valueOf={(m) => m.collected}
              format={formatCurrency}
              tone="var(--green-600)"
              chartLabel="Collected per month"
            />
          ) : (
            <p className="subtle">No completed payments in the last 12 months.</p>
          )}
        </section>

        <section className="trend-section">
          <div className="trend-head">
            <h3>Enrollment</h3>
            <span className="trend-total">{totalEnrollments} new students</span>
          </div>
          {hasEnrollments ? (
            <BarChart
              rows={rows}
              valueOf={(m) => m.enrollments}
              format={(v) => `${v} student${v === 1 ? '' : 's'}`}
              tone="var(--blue-600)"
              chartLabel="New students per month"
            />
          ) : (
            <p className="subtle">No new student accounts in the last 12 months.</p>
          )}
        </section>
      </div>

      {rows.length > 0 && (
        <table className="sr-only" id={tableId}>
          <caption>Monthly trends, {rows[0].label} to {rows[rows.length - 1].label}</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Collected</th>
              <th scope="col">Payments</th>
              <th scope="col">New students</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.month}>
                <th scope="row">{m.label}</th>
                <td>{formatCurrency(m.collected)}</td>
                <td>{m.payments}</td>
                <td>{m.enrollments}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

/** One bar chart: a fixed-size SVG scaled to its container, bars per month. */
function BarChart({ rows, valueOf, format, tone, chartLabel }) {
  const WIDTH = 320
  const HEIGHT = 96
  const values = rows.map(valueOf)
  const max = Math.max(...values)
  const total = values.reduce((sum, v) => sum + v, 0)
  const peakIndex = values.indexOf(max)
  const slot = WIDTH / rows.length
  const barWidth = Math.max(slot - 4, 2)

  const summary =
    `${chartLabel}: ${format(total)} across ${rows.length} months, ` +
    `peak ${format(max)} in ${rows[peakIndex].label}.`

  return (
    <div className="trend-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={summary}
        preserveAspectRatio="none"
      >
        {rows.map((m, i) => {
          const value = values[i]
          const h = max > 0 ? Math.max((value / max) * (HEIGHT - 8), 0) : 0
          return (
            <rect
              key={m.month}
              x={i * slot + 2}
              y={HEIGHT - h}
              width={barWidth}
              height={h}
              rx={2}
              fill={tone}
            >
              <title>{`${m.label}: ${format(value)}`}</title>
            </rect>
          )
        })}
      </svg>
      <div className="trend-axis">
        <span>{rows[0].label}</span>
        <span>{rows[rows.length - 1].label}</span>
      </div>
    </div>
  )
}
