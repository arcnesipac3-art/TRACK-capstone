import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../services/api'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import LoadingSpinner from '../components/LoadingSpinner'
import { formatCurrency } from '../utils/format'

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
        setSchoolYearFilter(sys[0].id)
      }
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load fee summary.')
    } finally { setLoading(false) }
  }, [schoolYearFilter])

  useEffect(() => { load() }, [load])

  if (loading) return <LoadingSpinner size="lg" />
  if (error) return <ErrorMessage message={error} onRetry={load} />
  if (!summary) return (
    <div className="page">
      <PageHeader title="My Fees" subtitle="No fee data available" />
      <EmptyState title="No fee data" description="Your fee assessments will appear here once published." />
    </div>
  )

  // Sort: unpaid first, then partial, then paid; then by due date
  const sorted = [...summary.assessments].sort((a, b) => {
    const order = { unpaid: 0, partial: 1, paid: 2 }
    const diff = order[a.payment_status] - order[b.payment_status]
    if (diff !== 0) return diff
    return new Date(a.due_date) - new Date(b.due_date)
  })

  return (
    <div className="page">
      <PageHeader
        title="My Fees"
        subtitle={`Total Outstanding: ${formatCurrency(summary.total_outstanding)}`}
      />

      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <span className="stat-label">Total Assessed</span>
          <span className="stat-value">{formatCurrency(summary.total_assessed)}</span>
        </div>
        <div className="stat-card positive">
          <span className="stat-label">Total Paid</span>
          <span className="stat-value">{formatCurrency(summary.total_paid)}</span>
        </div>
        <div className="stat-card warning">
          <span className="stat-label">Outstanding</span>
          <span className="stat-value">{formatCurrency(summary.total_outstanding)}</span>
        </div>
      </div>

      {schoolYears.length > 1 && (
        <div className="form-group" style={{ marginBottom: '1.5rem', maxWidth: '300px' }}>
          <label htmlFor="school_year">School Year</label>
          <select id="school_year" value={schoolYearFilter} onChange={e => setSchoolYearFilter(e.target.value)}>
            {schoolYears.map(sy => <option key={sy.id} value={sy.id}>{sy.label}</option>)}
          </select>
        </div>
      )}

      <section>
        <h2>Fee Assessments</h2>
        {sorted.length === 0 ? (
          <EmptyState title="No assessments" description="No fee assessments published for the selected period." />
        ) : (
          <div className="table-responsive">
            <table className="data-table">
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
                {sorted.map(a => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.category}</strong>
                      {a.description && <> <br /> <small className="text-muted">{a.description}</small> </>}
                    </td>
                    <td>
                      <span className={`badge ${a.category_fee_type === 'voluntary' ? 'badge-info' : 'badge-warning'}`}>
                        {a.category_fee_type === 'voluntary' ? 'Voluntary' : 'Required'}
                      </span>
                    </td>
                    <td>{new Date(a.due_date).toLocaleDateString()}</td>
                    <td>{formatCurrency(a.amount)}</td>
                    <td>{formatCurrency(a.paid_amount)}</td>
                    <td className={a.outstanding > 0 ? 'text-warning' : 'text-success'}>
                      {formatCurrency(a.outstanding)}
                    </td>
                    <td>
                      <span className={`badge ${
                        a.payment_status === 'paid' ? 'badge-success' :
                        a.payment_status === 'partial' ? 'badge-warning' : 'badge-danger'
                      }`}>
                        {a.payment_status}
                      </span>
                    </td>
                    <td>
                      {a.receipt_number ? (
                        <code>{a.receipt_number}</code>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}