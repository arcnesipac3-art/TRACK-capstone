import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../services/api'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import CardSkeleton from '../components/loading/CardSkeleton'
import StatCardSkeleton from '../components/loading/StatCardSkeleton'
import StatCard from '../components/StatCard'
import Card from '../components/dashboard/Card'
import { formatCurrency, formatDate } from '../utils/format'

/**
 * Student Fee Summary — View own fee assessments and payment status
 */
export default function StudentFeesPage() {
  const [summary, setSummary] = useState(null)
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
      setSummary(data[0] || null)
      setSchoolYears(sys)
      if (!schoolYearFilter && sys.length > 0) {
        // Default to the active school year when one exists.
        const active = sys.find((sy) => sy.is_active) || sys[0]
        setSchoolYearFilter(active.id)
      }
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load fee summary.')
    } finally { setLoading(false) }
  }, [schoolYearFilter])

  // `load` writes state only after its request resolves; queueMicrotask keeps
  // the kickoff off the effect's synchronous pass.
  useEffect(() => { queueMicrotask(load) }, [load])

  if (loading) {
    return (
      <>
        <PageHeader title="My Fees" />
        {/* Placeholders mirror the loaded layout (3 metrics + the assessments
            table) so nothing shifts when the summary arrives. */}
        <span className="sr-only" role="status">
          Loading fee summary…
        </span>
        <div className="grid grid-3" aria-hidden="true">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <div aria-hidden="true">
          <CardSkeleton lines={0} blockHeight={220} />
        </div>
      </>
    )
  }
  if (error) return <ErrorMessage error={error} title="Could not load fee summary" onRetry={load} />

  // Sort: unpaid first, then partial, then paid; then by due date
  const sorted = [...(summary?.assessments || [])].sort((a, b) => {
    const order = { unpaid: 0, partial: 1, paid: 2 }
    const diff = order[a.payment_status] - order[b.payment_status]
    if (diff !== 0) return diff
    return new Date(a.due_date) - new Date(b.due_date)
  })

  return (
    <div className="stack stack-md">
      <PageHeader
        title="My Fees"
        subtitle={
          summary
            ? `${formatCurrency(summary.total_outstanding)} outstanding`
            : 'No fee data available'
        }
      />

      {schoolYears.length > 1 && (
        <div className="filter-bar">
          <div className="field" style={{ minWidth: 240 }}>
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

      {!summary ? (
        <EmptyState
          icon="inbox"
          title="No fee data"
          message="Your fee assessments will appear here once published."
        />
      ) : (
        <>
          <div className="grid grid-3">
            <StatCard label="Total Assessed" value={formatCurrency(summary.total_assessed)} />
            <StatCard label="Total Paid" value={formatCurrency(summary.total_paid)} tone="green" />
            <StatCard label="Outstanding" value={formatCurrency(summary.total_outstanding)} tone="amber" />
          </div>

          <Card
            title="Fee Assessments"
            flush
            empty={
              sorted.length === 0 ? (
                <EmptyState
                  icon="inbox"
                  title="No assessments"
                  message="No fee assessments published for the selected period."
                />
              ) : null
            }
          >
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
                  {sorted.map((a) => (
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
                        <span className={`badge ${a.category_fee_type === 'voluntary' ? 'badge-info' : 'badge-warning'}`}>
                          {a.category_fee_type === 'voluntary' ? 'Voluntary' : 'Required'}
                        </span>
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
                        <span className={`badge ${
                          a.payment_status === 'paid'
                            ? 'badge-success'
                            : a.payment_status === 'partial'
                              ? 'badge-warning'
                              : 'badge-error'
                        }`}>
                          {a.payment_status}
                        </span>
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
          </Card>
        </>
      )}
    </div>
  )
}
