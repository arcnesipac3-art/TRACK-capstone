import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../services/api'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import LoadingSpinner from '../components/LoadingSpinner'
import { formatCurrency } from '../utils/format'

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
        setSchoolYearFilter(sys[0].id)
      }
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load fee summaries.')
    } finally { setLoading(false) }
  }, [schoolYearFilter])

  useEffect(() => { load() }, [load])

  if (loading) return <LoadingSpinner size="lg" />
  if (error) return <ErrorMessage message={error} onRetry={load} />

  const sort = (arr) => [...arr].sort((a, b) => {
    const order = { unpaid: 0, partial: 1, paid: 2 }
    const diff = order[a.payment_status] - order[b.payment_status]
    if (diff !== 0) return diff
    return new Date(a.due_date) - new Date(b.due_date)
  })

  const totalOutstanding = summaries.reduce((a, b) => a + b.total_outstanding, 0)

  return (
    <div className="page">
      <PageHeader
        title="Children's Fees"
        subtitle={summaries.length > 0
          ? `${summaries.length} child(ren) · Total Outstanding: ${formatCurrency(totalOutstanding)}`
          : 'No fee data available'}
      />

      {schoolYears.length > 1 && (
        <div className="form-group" style={{ marginBottom: '1.5rem', maxWidth: '300px' }}>
          <label htmlFor="school_year">School Year</label>
          <select id="school_year" value={schoolYearFilter} onChange={e => setSchoolYearFilter(e.target.value)}>
            {schoolYears.map(sy => <option key={sy.id} value={sy.id}>{sy.label}</option>)}
          </select>
        </div>
      )}

      {summaries.length === 0 ? (
        <EmptyState title="No fee data" description="Your children's fee assessments will appear here once published." />
      ) : (
        <>
          {summaries.map((summary, idx) => (
            <section key={summary.id} className="child-fees-section" style={{ marginBottom: '2rem' }}>
              <div className="child-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <h3 style={{ margin: '0 0 0.25rem' }}>{summary.user.full_name}</h3>
                  <p className="text-muted" style={{ margin: 0 }}>
                    {summary.section_name} · LRN: {summary.lrn || 'N/A'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '1.5rem', textAlign: 'right' }}>
                  <div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>Assessed</div>
                    <div style={{ fontWeight: 600 }}>{formatCurrency(summary.total_assessed)}</div>
                  </div>
                  <div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>Paid</div>
                    <div style={{ fontWeight: 600, color: 'var(--green)' }}>{formatCurrency(summary.total_paid)}</div>
                  </div>
                  <div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>Outstanding</div>
                    <div style={{ fontWeight: 600, color: 'var(--red)' }}>{formatCurrency(summary.total_outstanding)}</div>
                  </div>
                </div>
              </div>

              {summary.assessments.length === 0 ? (
                <EmptyState title="No assessments" description="No fee assessments published for this period." inline />
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
                      {sort(summary.assessments).map(a => (
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
                            {a.receipt_number ? <code>{a.receipt_number}</code> : <span className="text-muted">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  )
}