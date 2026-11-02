import Card from './Card'
import EmptyState from '../EmptyState'
import StatusBadge from '../StatusBadge'
import { formatCurrency } from '../../utils/format'
import './FinanceSummaryCard.css'

/**
 * All fee figures for one administrator, in one place.
 *
 * Built from the backend's aggregate — `{ total_assessed, total_collected,
 * total_outstanding, active_school_year }` — and the collection rate is only
 * the ratio those figures already imply: with nothing assessed there is no
 * rate to show, so the card falls back to an honest empty state instead of a
 * fabricated 0%. `action` is the caller's permission-aware shortcut.
 */
export default function FinanceSummaryCard({ fees, action }) {
  const assessed = fees.total_assessed || 0
  const collected = fees.total_collected || 0
  const outstanding = fees.total_outstanding || 0
  const rate = assessed > 0 ? Math.round((collected / assessed) * 100) : null

  return (
    <Card
      title="Finance summary"
      action={
        <span className="row row-wrap gap-xs">
          {rate !== null && (
            <StatusBadge
              tone={rate === 100 ? 'green' : 'blue'}
              label={`${rate}% collected`}
              title="Share of assessed fees already collected"
            />
          )}
          {action}
        </span>
      }
      empty={
        assessed === 0 ? (
          <EmptyState
            icon="creditCard"
            title="No published assessments yet"
            message="Fee totals appear here once an assessment is published for the active school year."
          />
        ) : null
      }
    >
      {assessed > 0 && (
        <>
          <dl className="fin-figures">
            <div className="fin-row">
              <dt>Fees assessed</dt>
              <dd>{formatCurrency(assessed)}</dd>
            </div>
            <div className="fin-row tone-green">
              <dt>Fees collected</dt>
              <dd>{formatCurrency(collected)}</dd>
            </div>
            <div className={`fin-row${outstanding > 0 ? ' tone-amber' : ' tone-green'}`}>
              <dt>Outstanding balance</dt>
              <dd>{formatCurrency(outstanding)}</dd>
            </div>
          </dl>
          <div
            className="progress-track fin-track"
            role="img"
            aria-label={`Collected ${collected} of ${assessed} assessed`}
          >
            <div className="progress-fill green" style={{ width: `${rate}%` }} />
          </div>
          <p className="subtle fin-note">
            {fees.active_school_year
              ? `School year ${fees.active_school_year} · `
              : ''}
            {rate}% of assessed fees collected.
          </p>
        </>
      )}
    </Card>
  )
}
