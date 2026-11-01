import { useId } from 'react'
import Card from './Card'
import { formatCurrency } from '../../utils/format'

/**
 * Monthly collection and enrollment trends, drawn as inline SVG lines.
 *
 * No chart library: one <svg> per series, one vertex per month, each with a
 * native <title> tooltip. A trend over time is read as a line, so the twelve
 * months are plotted as a stroked polyline over a tinted area and a hairline
 * baseline. The drawing is decorative (the <svg> carries a text summary in its
 * aria-label); a visually hidden table repeats every number for screen readers.
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
            <TrendLine
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
            <TrendLine
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

/** One trend line: a fixed 320×96 box scaled to its container, one vertex per month. */
function TrendLine({ rows, valueOf, format, tone, chartLabel }) {
  const WIDTH = 320
  const HEIGHT = 96
  const PAD = 8
  const values = rows.map(valueOf)
  const max = Math.max(...values)
  const total = values.reduce((sum, v) => sum + v, 0)
  const peakIndex = values.indexOf(max)
  const step = values.length > 1 ? (WIDTH - PAD * 2) / (values.length - 1) : 0
  const x = (i) => PAD + i * step
  const y = (v) => HEIGHT - PAD - (max > 0 ? (v / max) * (HEIGHT - PAD * 2) : 0)
  const baseline = HEIGHT - PAD
  const vertices = values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const area = `${PAD},${baseline} ${vertices} ${x(values.length - 1)},${baseline}`

  const summary =
    `${chartLabel}: ${format(total)} across ${rows.length} months, ` +
    `peak ${format(max)} in ${rows[peakIndex].label}.`

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={summary}>
        <line
          className="trend-baseline"
          x1={PAD}
          x2={WIDTH - PAD}
          y1={baseline}
          y2={baseline}
        />
        <polygon className="trend-area" points={area} fill={tone} />
        <polyline
          className="trend-line"
          points={vertices}
          stroke={tone}
          vectorEffect="non-scaling-stroke"
        />
        {values.map((v, i) => (
          <circle
            key={rows[i].month}
            className={i === peakIndex ? 'trend-dot is-peak' : 'trend-dot'}
            cx={x(i)}
            cy={y(v)}
            r={i === peakIndex ? 3.4 : 2.2}
            fill={tone}
          >
            <title>{`${rows[i].label}: ${format(v)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="trend-axis">
        <span>{rows[0].label}</span>
        <span>{rows[rows.length - 1].label}</span>
      </div>
    </div>
  )
}
