import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../services/api'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import CardSkeleton from '../components/loading/CardSkeleton'
import StatCard from '../components/StatCard'
import Card from '../components/dashboard/Card'
import StatusBadge from '../components/StatusBadge'
import { formatCurrency, formatDate } from '../utils/format'

/**
 * Parent Fee Summary — View children's fee assessments
 */
export default function ParentFeesPage() {
  const [summaries, setSummaries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [schoolYearFilter, setSchoolYearFilter] = useState('')
  const [schoolYears, setSchoolYears] = useState([])

  const load = useCallback(async () => {
    try {
      const [data, sys] = await Promise.all([
        api.get('/fee-summary/', { params: { school_year: schoolYearFilter || undefined } }),
        api.list('/school-years/'),
      ])
      setSummaries(data)
      setSchoolYears(sys)
      if (!schoolYearFilter && sys.length > 0) {
        // Default to the active school year when one exists.
        const active = sys.find((sy) => sy.is_active) || sys[0]
        setSchoolYearFilter(active.id)
      }
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load fee summaries.')
    } finally { setLoading(false) }
  }, [schoolYearFilter])

  // `load` writes state only after its request resolves; queueMicrotask keeps
  // the kickoff off the effect's synchronous pass.
  useEffect(() => { queueMicrotask(load) }, [load])

  if (loading) {
    // One placeholder card per child block: header + 3 metrics + table.
    return (
      <div className="stack stack-md">
        <PageHeader title="Children's Fees" />
        <span className="sr-only" role="status">
          Loading fee summaries…
        </span>
        <div aria-hidden="true">
          <CardSkeleton lines={0} blockHeight={180} />
        </div>
      </div>
    )
  }
  if (error) return <ErrorMessage error={error} title="Could not load fee summaries" onRetry={load} />

  const sort = (arr) => [...arr].sort((a, b) => {
    const order = { unpaid: 0, partial: 1, paid: 2 }
    const diff = order[a.payment_status] - order[b.payment_status]
    if (diff !== 0) return diff
    return new Date(a.due_date) - new Date(b.due_date)
  })

  const totalOutstanding = summaries.reduce((a, b) => a + Number(b.total_outstanding), 0)

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Children's Fees"
        subtitle={
          summaries.length > 0
            ? `${summaries.length} child${summaries.length > 1 ? 'ren' : ''} · ${formatCurrency(totalOutstanding)} outstanding`
            : 'No fee data available'
        }
      />

      {schoolYears.length > 1 && (
        <div className="filter-bar">
          <div className="field grow">
            <label htmlFor="school_year">School Year</label>
            <select
              id="school_year"
              className="select"
              value={schoolYearFilter}
              onChange={(e) => setSchoolYearFilter(e.target.value)}
            >
              {schoolYears.map((sy) => (
                <option key={sy.id} value={sy.id}>{sy.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {summaries.length === 0 ? (
        <Card
          empty={
            <EmptyState
              icon="users"
              title="No fee data"
              message="Your children's fee assessments will appear here once published."
            />
          }
        />
      ) : (
        summaries.map((summary) => (
          <ChildFeeCard key={summary.id} summary={summary} sort={sort} />
        ))
      )}
    </div>
  )
}

/** One child: the totals above their assessment table, or why there is none. */
function ChildFeeCard({ summary, sort }) {
  const rows = summary.assessments || []
  return (
    <Card
      title={summary.user?.full_name || 'Student'}
      // The table runs to the card's edge, but an empty state below the
      // totals needs the body padding, so flush follows the rows.
      flush={rows.length > 0}
    >
      {/* In a flush body the summary block carries its own padding. */}
      <div className={rows.length > 0 ? 'stack stack-md card-pad' : 'stack stack-md'}>
        <p className="subtle">
          {summary.section_name || 'No section'} · LRN: {summary.lrn || 'N/A'}
        </p>

        <div className="grid grid-3">
          <StatCard label="Assessed" value={formatCurrency(summary.total_assessed)} icon="file" />
          <StatCard label="Paid" value={formatCurrency(summary.total_paid)} tone="green" icon="checkCircle" />
          <StatCard label="Outstanding" value={formatCurrency(summary.total_outstanding)} tone="amber" icon="clock" />
        </div>

        {rows.length === 0 && (
          <EmptyState
            icon="inbox"
            title="No assessments"
            message="No fee assessments published for this period."
          />
        )}
      </div>

      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="table responsive-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Type</th>
                <th>Due Date</th>
                <th>Assessed</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {sort(rows).map((a) => (
                <tr key={a.id}>
                  <td data-label="Category" className="cell-main">
                    <strong>{a.category}</strong>
                    {a.description && (
                      <>
                        <br />
                        <small className="muted">{a.description}</small>
                      </>
                    )}
                  </td>
                  <td data-label="Type">
                    <StatusBadge
                      tone={a.category_fee_type === 'voluntary' ? 'blue' : 'amber'}
                      label={a.category_fee_type === 'voluntary' ? 'Voluntary' : 'Required'}
                    />
                  </td>
                  <td data-label="Due Date">{formatDate(a.due_date)}</td>
                  <td data-label="Assessed">{formatCurrency(a.amount)}</td>
                  <td data-label="Paid">{formatCurrency(a.paid_amount)}</td>
                  <td data-label="Balance">
                    {a.outstanding > 0 ? (
                      <strong>{formatCurrency(a.outstanding)}</strong>
                    ) : (
                      formatCurrency(a.outstanding)
                    )}
                  </td>
                  <td data-label="Status">
                    <StatusBadge
                      tone={
                        a.payment_status === 'paid'
                          ? 'green'
                          : a.payment_status === 'partial'
                            ? 'amber'
                            : 'red'
                      }
                      label={a.payment_status}
                    />
                  </td>
                  <td data-label="Receipt">
                    {a.receipt_number ? (
                      <code>{a.receipt_number}</code>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
