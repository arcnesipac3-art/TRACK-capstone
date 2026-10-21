import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../services/api'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import LoadingSpinner from '../components/LoadingSpinner'
import Icon from '../components/Icon'
import { formatNumber, formatCurrency } from '../utils/format'

/**
 * Admin Fee Management — Dashboard, Categories, Assessments, Payments, Reports
 */
export default function AdminFeesPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Data
  const [categories, setCategories] = useState([])
  const [assessments, setAssessments] = useState([])
  const [dashboard, setDashboard] = useState(null)

  const load = useCallback(async () => {
    try {
      const [cats, asses, dash] = await Promise.all([
        api.list('/fee-categories/'),
        api.list('/fee-assessments/'),
        api.get('/fee-dashboard/'),
      ])
      setCategories(cats)
      setAssessments(asses)
      setDashboard(dash)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load fee data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <LoadingSpinner size="lg" />
  if (error) return <ErrorMessage message={error} onRetry={load} />

  // --- Dashboard Tab ---
  if (activeTab === 'dashboard') {
    return (
      <div className="page">
        <PageHeader
          title="Fee Management"
          subtitle={dashboard ? `₱${formatNumber(dashboard.total_outstanding)} outstanding across ${dashboard.total_students_assessed} students` : 'Fee management dashboard'}
          actions={
            <a href="/admin/fees/categories/new" className="btn btn-primary">
              <Icon name="plus" size={16} /> Add Category
            </a>
          }
        />

        <section className="dashboard-section">
          <h2>Collection Summary</h2>
          <div className="stats-grid">
            <StatCard label="Total Assessed" value={formatCurrency(dashboard?.total_assessed)} icon="creditCard" />
            <StatCard label="Total Collected" value={formatCurrency(dashboard?.total_collected)} icon="checkCircle" positive />
            <StatCard label="Outstanding" value={formatCurrency(dashboard?.total_outstanding)} icon="alertCircle" warning />
            <StatCard label="Students w/ Balance" value={dashboard?.students_with_balance} icon="users" />
          </div>
        </section>

        <section className="dashboard-section">
          <h2>By Category</h2>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Assessed</th>
                  <th>Collected</th>
                  <th>Outstanding</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {dashboard?.category_breakdown?.map(cat => (
                  <tr key={cat.code}>
                    <td>{cat.category}</td>
                    <td>{formatCurrency(cat.assessed)}</td>
                    <td>{formatCurrency(cat.collected)}</td>
                    <td>{formatCurrency(cat.outstanding)}</td>
                    <td>
                      <span className={`badge ${cat.assessed > 0 && cat.collected / cat.assessed > 0.8 ? 'badge-success' : 'badge-warning'}`}>
                        {cat.assessed > 0 ? Math.round((cat.collected / cat.assessed) * 100) : 0}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="dashboard-section">
          <h2>Recent Payments</h2>
          {dashboard?.recent_payments?.length === 0 ? (
            <EmptyState title="No payments yet" description="Payments will appear here." />
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Method</th>
                    <th>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard?.recent_payments?.map(p => (
                    <tr key={p.id}>
                      <td>{p.student}</td>
                      <td>{p.category}</td>
                      <td>{formatCurrency(p.amount)}</td>
                      <td>{new Date(p.payment_date).toLocaleDateString()}</td>
                      <td><span className="badge">{p.payment_method}</span></td>
                      <td><code>{p.receipt_number}</code></td>
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

  // --- Categories Tab ---
  if (activeTab === 'categories') {
    const handleDelete = async (id) => {
      if (!window.confirm('Delete this fee category?')) return
      try {
        await api.delete(`/fee-categories/${id}/`)
        setCategories(categories.filter(c => c.id !== id))
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Could not delete category.')
      }
    }

    return (
      <div className="page">
        <PageHeader
          title="Fee Categories"
          subtitle={`${categories.length} categories`}
          actions={
            <a href="/admin/fees/categories/new" className="btn btn-primary">
              <Icon name="plus" size={16} /> New Category
            </a>
          }
        />

        {categories.length === 0 ? (
          <EmptyState title="No categories" description="Create a fee category to get started." action={{ label: 'Create Category', onClick: () => navigate('/admin/fees/categories/new') }} />
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Assessments</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => (
                  <tr key={cat.id}>
                    <td>
                      <strong>{cat.name}</strong>
                    </td>
                    <td><code>{cat.code}</code></td>
                    <td>
                      <span className={`badge ${cat.fee_type === 'compulsory' ? 'badge-warning' : 'badge-info'}`}>
                        {cat.fee_type === 'compulsory' ? 'Required' : 'Voluntary'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${cat.is_active ? 'badge-success' : 'badge-secondary'}`}>
                        {cat.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{cat.assessment_count}</td>
                    <td>
                      <div className="actions">
                        <a href={`/admin/fees/categories/${cat.id}`} className="btn btn-sm btn-ghost" title="Edit">
                          <Icon name="edit" size={14} />
                        </a>
                        <button className="btn btn-sm btn-ghost btn-danger" onClick={() => handleDelete(cat.id)} title="Delete">
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // --- Assessments Tab ---
  if (activeTab === 'assessments') {
    return (
      <div className="page">
        <PageHeader
          title="Fee Assessments"
          subtitle={`${assessments.length} assessments`}
          actions={
            <a href="/admin/fees/assessments/new" className="btn btn-primary">
              <Icon name="plus" size={16} /> New Assessment
            </a>
          }
        />

        {assessments.length === 0 ? (
          <EmptyState title="No assessments" description="Create an assessment to assign fees." action={{ label: 'Create Assessment', onClick: () => navigate('/admin/fees/assessments/new') }} />
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Due Date</th>
                  <th>Scope</th>
                  <th>Status</th>
                  <th>Collected / Assessed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assessments.map(a => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.category_name}</strong>
                      <br />
                      <small className="text-muted">{a.category_code}</small>
                    </td>
                    <td>{formatCurrency(a.amount)}</td>
                    <td>{new Date(a.due_date).toLocaleDateString()}</td>
                    <td>
                      {a.grade_level_name && <span className="badge badge-info">{a.grade_level_name}</span>}
                      {a.section_name && <span className="badge badge-secondary">{a.section_name}</span>}
                      {a.student_name && <span className="badge badge-primary">{a.student_name}</span>}
                      {!a.grade_level_name && !a.section_name && !a.student_name && (
                        <span className="badge badge-secondary">School-wide</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${
                        a.status === 'published' ? 'badge-success' :
                        a.status === 'archived' ? 'badge-secondary' : 'badge-warning'
                      }`}>
                        {a.status}
                      </span>
                    </td>
                    <td>{formatCurrency(a.total_collected)} / {formatCurrency(a.total_assessed)}</td>
                    <td>
                      <a href={`/admin/fees/assessments/${a.id}`} className="btn btn-sm btn-ghost" title="View/Edit">
                        <Icon name="edit" size={14} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // --- Payments/Reports Tabs (placeholder) ---
  return (
    <div className="page">
      <PageHeader title="Fee Management" subtitle="Coming soon" />
      <EmptyState title={`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`} description="This section is under development." />
    </div>
  )
}