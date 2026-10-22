import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../services/api'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import LoadingSpinner from '../components/LoadingSpinner'
import StatCard from '../components/StatCard'
import Card from '../components/dashboard/Card'
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

  useEffect(() => { load() }, [load])

  if (loading) return <LoadingSpinner block size="lg" label="Loading fee summaries…" />
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

      {summaries.length === 0 ? (
        <EmptyState
          icon="users"
          title="No fee data"
          message="Your children's fee assessments will appear here once published."
        />
      ) : (
        summaries.map((summary) => (
          <Card key={summary.id} title={summary.user?.full_name || 'Student'} flush>
            <div className="stack stack-md" style={{ padding: '16px 20px' }}>
              <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                {summary.section_name || 'No section'} · LRN: {summary.lrn || 'N/A'}
              </p>

              <div className="grid grid-3">
                <StatCard label="Assessed" value={formatCurrency(summary.total_assessed)} />
                <StatCard label="Paid" value={formatCurrency(summary.total_paid)} tone="green" />
                <StatCard label="Outstanding" value={formatCurrency(summary.total_outstanding)} tone="amber" />
              </div>
            </div>

            {summary.assessments.length === 0 ? (
              <EmptyState
                icon="inbox"
                title="No assessments"
                message="No fee assessments published for this period."
              />
            ) : (
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
                    {sort(summary.assessments).map((a) => (
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
            )}
          </Card>
        ))
      )}
    </div>
  )
}
