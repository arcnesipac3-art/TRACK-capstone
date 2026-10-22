import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../services/api'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import LoadingSpinner from '../components/LoadingSpinner'
import Icon from '../components/Icon'
import Button from '../components/Button'
import Modal from '../components/Modal'
import { formatNumber, formatCurrency, formatDate } from '../utils/format'

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
  const [students, setStudents] = useState([])
  const [schoolYears, setSchoolYears] = useState([])
  const [gradeLevels, setGradeLevels] = useState([])
  const [sections, setSections] = useState([])

  // Payment modal
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState(null)
  const [paymentForm, setPaymentForm] = useState({
    assessment: '',
    student: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    reference_number: '',
    notes: '',
  })

  // Load all reference data
  const load = useCallback(async () => {
    try {
      const [cats, asses, dash, studs, sys, gls, secs] = await Promise.all([
        api.list('/fee-categories/'),
        api.list('/fee-assessments/'),
        api.get('/fee-dashboard/'),
        api.list('/students/'),
        api.list('/school-years/'),
        api.list('/grade-levels/'),
        api.list('/sections/'),
      ])
      setCategories(cats)
      setAssessments(asses)
      setDashboard(dash)
      setStudents(studs)
      setSchoolYears(sys)
      setGradeLevels(gls)
      setSections(secs)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load fee data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // --- Payment Modal Helpers ---
  const openPaymentModal = (prefill = {}) => {
    setPaymentForm({
      assessment: prefill.assessment || '',
      student: prefill.student || '',
      amount: prefill.amount || '',
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'cash',
      reference_number: '',
      notes: '',
      ...prefill,
    })
    setPaymentError(null)
    setPaymentModalOpen(true)
  }

  const closePaymentModal = () => {
    setPaymentModalOpen(false)
    setPaymentError(null)
  }

  const handlePaymentSubmit = async (e) => {
    e.preventDefault()
    if (!paymentForm.assessment || !paymentForm.student || !paymentForm.amount || !paymentForm.payment_date) {
      setPaymentError('Assessment, student, amount, and date are required.')
      return
    }
    setPaymentLoading(true)
    setPaymentError(null)
    try {
      const payload = {
        assessment: Number(paymentForm.assessment),
        student: Number(paymentForm.student),
        amount: parseFloat(paymentForm.amount).toFixed(2),
        payment_date: paymentForm.payment_date,
        payment_method: paymentForm.payment_method,
        reference_number: paymentForm.reference_number || '',
        notes: paymentForm.notes || '',
      }
      await api.post('/fee-payments/', payload)
      closePaymentModal()
      load() // Refresh all data
    } catch (err) {
      setPaymentError(err instanceof ApiError ? err.message : 'Could not record payment.')
    } finally {
      setPaymentLoading(false)
    }
  }

  const handlePaymentChange = (field, value) => {
    setPaymentForm(prev => ({ ...prev, [field]: value }))
  }

  // Filter students based on selected assessment
  const getFilteredStudents = () => {
    if (!paymentForm.assessment) return students
    const assessment = assessments.find(a => a.id == paymentForm.assessment)
    if (!assessment) return students
    
    // Filter students based on assessment scope
    if (assessment.student) {
      return students.filter(s => s.id == assessment.student)
    }
    if (assessment.section) {
      return students.filter(s => s.section == assessment.section)
    }
    if (assessment.grade_level) {
      const gradeSections = sections.filter(s => s.grade_level == assessment.grade_level && s.school_year == assessment.school_year).map(s => s.id)
      return students.filter(s => gradeSections.includes(s.section))
    }
    if (assessment.school_year) {
      const sySections = sections.filter(s => s.school_year == assessment.school_year).map(s => s.id)
      return students.filter(s => sySections.includes(s.section))
    }
    return students
  }

  const filteredStudents = getFilteredStudents()

  // Auto-fill amount when assessment selected
  const selectedAssessment = assessments.find(a => a.id == paymentForm.assessment)
  const autoAmount = selectedAssessment ? String(selectedAssessment.amount) : ''

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
            <>
              <Button variant="primary" onClick={() => openPaymentModal()}>
                <Icon name="plus" size={16} /> Record Payment
              </Button>
              <a href="/admin/fees/categories/new" className="btn btn-primary" style={{ marginLeft: '8px' }}>
                <Icon name="plus" size={16} /> Add Category
              </a>
            </>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2>Recent Payments</h2>
            <Button variant="primary" onClick={() => openPaymentModal()} size="sm">
              <Icon name="plus" size={14} /> Record Payment
            </Button>
          </div>
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
                      <td>{formatDate(p.payment_date)}</td>
                      <td><span className="badge">{p.payment_method}</span></td>
                      <td><code>{p.receipt_number}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Payment Modal */}
        <Modal isOpen={paymentModalOpen} onClose={closePaymentModal} title="Record Payment" size="lg">
          <form onSubmit={handlePaymentSubmit}>
            {paymentError && <div className="alert alert-error">{paymentError}</div>}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="pm_assessment">Assessment <span className="required">*</span></label>
                <select id="pm_assessment" value={paymentForm.assessment} onChange={e => handlePaymentChange('assessment', e.target.value)} required>
                  <option value="">Select assessment</option>
                  {assessments.filter(a => a.status === 'published').map(a => (
                    <option key={a.id} value={a.id}>
                      {a.category_name} — ₱{formatNumber(a.amount)} — {a.grade_level_name || 'School-wide'} {a.section_name ? '· ' + a.section_name : ''} {a.student_name ? '· ' + a.student_name : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="pm_student">Student <span className="required">*</span></label>
                <select id="pm_student" value={paymentForm.student} onChange={e => handlePaymentChange('student', e.target.value)} required disabled={!paymentForm.assessment}>
                  <option value="">Select student</option>
                  {filteredStudents.map(s => (
                    <option key={s.id} value={s.id}>{s.user.full_name} — {s.section_name}</option>
                  ))}
                </select>
                {!paymentForm.assessment && <small className="text-muted">Select an assessment first</small>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="pm_amount">Amount (PHP) <span className="required">*</span></label>
                <input id="pm_amount" type="number" step="0.01" min="0.01"
                  value={paymentForm.amount || autoAmount}
                  onChange={e => handlePaymentChange('amount', e.target.value)}
                  placeholder="e.g. 5000.00" required />
              </div>
              <div className="form-group">
                <label htmlFor="pm_date">Payment Date <span className="required">*</span></label>
                <input id="pm_date" type="date" value={paymentForm.payment_date}
                  onChange={e => handlePaymentChange('payment_date', e.target.value)} required />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="pm_method">Payment Method</label>
                <select id="pm_method" value={paymentForm.payment_method} onChange={e => handlePaymentChange('payment_method', e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="check">Check</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="online">Online</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="pm_reference">Reference Number</label>
                <input id="pm_reference" type="text"
                  value={paymentForm.reference_number}
                  onChange={e => handlePaymentChange('reference_number', e.target.value)}
                  placeholder="Optional check/transaction ref" />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="pm_notes">Notes</label>
              <textarea id="pm_notes" rows={3}
                value={paymentForm.notes}
                onChange={e => handlePaymentChange('notes', e.target.value)}
                placeholder="Optional notes" />
            </div>

            <div className="form-actions">
              <Button type="button" variant="secondary" onClick={closePaymentModal} disabled={paymentLoading}>Cancel</Button>
              <Button type="submit" variant="primary" loading={paymentLoading}>
                {paymentLoading ? 'Recording...' : 'Record Payment'}
              </Button>
            </div>
          </form>
        </Modal>
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
                    <td><strong>{cat.name}</strong></td>
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
            <>
              <Button variant="primary" onClick={() => openPaymentModal()}>
                <Icon name="plus" size={16} /> Record Payment
              </Button>
              <a href="/admin/fees/assessments/new" className="btn btn-primary" style={{ marginLeft: '8px' }}>
                <Icon name="plus" size={16} /> New Assessment
              </a>
            </>
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
                    <td>{formatDate(a.due_date)}</td>
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
                      <div className="actions">
                        <a href={`/admin/fees/assessments/${a.id}`} className="btn btn-sm btn-ghost" title="View/Edit">
                          <Icon name="edit" size={14} />
                        </a>
                        {a.status === 'published' && (
                          <Button variant="primary" size="sm" onClick={() => openPaymentModal({ assessment: a.id })}>
                            <Icon name="plus" size={12} /> Pay
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Payment Modal */}
        <Modal isOpen={paymentModalOpen} onClose={closePaymentModal} title="Record Payment" size="lg">
          <form onSubmit={handlePaymentSubmit}>
            {paymentError && <div className="alert alert-error">{paymentError}</div>}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="pm_assessment">Assessment <span className="required">*</span></label>
                <select id="pm_assessment" value={paymentForm.assessment} onChange={e => handlePaymentChange('assessment', e.target.value)} required>
                  <option value="">Select assessment</option>
                  {assessments.filter(a => a.status === 'published').map(a => (
                    <option key={a.id} value={a.id}>
                      {a.category_name} — ₱{formatNumber(a.amount)} — {a.grade_level_name || 'School-wide'} {a.section_name ? '· ' + a.section_name : ''} {a.student_name ? '· ' + a.student_name : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="pm_student">Student <span className="required">*</span></label>
                <select id="pm_student" value={paymentForm.student} onChange={e => handlePaymentChange('student', e.target.value)} required disabled={!paymentForm.assessment}>
                  <option value="">Select student</option>
                  {filteredStudents.map(s => (
                    <option key={s.id} value={s.id}>{s.user.full_name} — {s.section_name}</option>
                  ))}
                </select>
                {!paymentForm.assessment && <small className="text-muted">Select an assessment first</small>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="pm_amount">Amount (PHP) <span className="required">*</span></label>
                <input id="pm_amount" type="number" step="0.01" min="0.01"
                  value={paymentForm.amount || autoAmount}
                  onChange={e => handlePaymentChange('amount', e.target.value)}
                  placeholder="e.g. 5000.00" required />
              </div>
              <div className="form-group">
                <label htmlFor="pm_date">Payment Date <span className="required">*</span></label>
                <input id="pm_date" type="date" value={paymentForm.payment_date}
                  onChange={e => handlePaymentChange('payment_date', e.target.value)} required />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="pm_method">Payment Method</label>
                <select id="pm_method" value={paymentForm.payment_method} onChange={e => handlePaymentChange('payment_method', e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="check">Check</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="online">Online</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="pm_reference">Reference Number</label>
                <input id="pm_reference" type="text"
                  value={paymentForm.reference_number}
                  onChange={e => handlePaymentChange('reference_number', e.target.value)}
                  placeholder="Optional check/transaction ref" />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="pm_notes">Notes</label>
              <textarea id="pm_notes" rows={3}
                value={paymentForm.notes}
                onChange={e => handlePaymentChange('notes', e.target.value)}
                placeholder="Optional notes" />
            </div>

            <div className="form-actions">
              <Button type="button" variant="secondary" onClick={closePaymentModal} disabled={paymentLoading}>Cancel</Button>
              <Button type="submit" variant="primary" loading={paymentLoading}>
                {paymentLoading ? 'Recording...' : 'Record Payment'}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    )
  }

  // --- Payments Tab ---
  if (activeTab === 'payments') {
    const [payments, setPayments] = useState([])
    const [paymentsLoading, setPaymentsLoading] = useState(true)

    useEffect(() => {
      const fetchPayments = async () => {
        try {
          const data = await api.list('/fee-payments/')
          setPayments(data)
        } catch (err) {
          console.error('Failed to load payments:', err)
        } finally {
          setPaymentsLoading(false)
        }
      }
      fetchPayments()
    }, [])

    if (paymentsLoading) return <LoadingSpinner size="lg" />

    return (
      <div className="page">
        <PageHeader
          title="All Payments"
          subtitle={`${payments.length} payments recorded`}
          actions={
            <Button variant="primary" onClick={() => openPaymentModal()}>
              <Icon name="plus" size={16} /> Record Payment
            </Button>
          }
        />

        {payments.length === 0 ? (
          <EmptyState title="No payments recorded" description="Record the first payment to get started." action={{ label: 'Record Payment', onClick: () => openPaymentModal() }} />
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
                  <th>Reference</th>
                  <th>Receipt</th>
                  <th>Status</th>
                  <th>Recorded By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td>{p.student_name}</td>
                    <td>{p.assessment_category}</td>
                    <td>{formatCurrency(p.amount)}</td>
                    <td>{formatDate(p.payment_date)}</td>
                    <td><span className="badge">{p.payment_method}</span></td>
                    <td>{p.reference_number || '—'}</td>
                    <td><code>{p.receipt_number}</code></td>
                    <td>
                      <span className={`badge ${
                        p.status === 'completed' ? 'badge-success' :
                        p.status === 'voided' ? 'badge-error' :
                        p.status === 'refunded' ? 'badge-warning' : 'badge-secondary'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td>{p.recorded_by_name || '—'}</td>
                    <td>
                      <a href={`/admin/fees/payments/${p.id}`} className="btn btn-sm btn-ghost" title="View">
                        <Icon name="eye" size={14} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Payment Modal */}
        <Modal isOpen={paymentModalOpen} onClose={closePaymentModal} title="Record Payment" size="lg">
          <form onSubmit={handlePaymentSubmit}>
            {paymentError && <div className="alert alert-error">{paymentError}</div>}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="pm_assessment">Assessment <span className="required">*</span></label>
                <select id="pm_assessment" value={paymentForm.assessment} onChange={e => handlePaymentChange('assessment', e.target.value)} required>
                  <option value="">Select assessment</option>
                  {assessments.filter(a => a.status === 'published').map(a => (
                    <option key={a.id} value={a.id}>
                      {a.category_name} — ₱{formatNumber(a.amount)} — {a.grade_level_name || 'School-wide'} {a.section_name ? '· ' + a.section_name : ''} {a.student_name ? '· ' + a.student_name : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="pm_student">Student <span className="required">*</span></label>
                <select id="pm_student" value={paymentForm.student} onChange={e => handlePaymentChange('student', e.target.value)} required disabled={!paymentForm.assessment}>
                  <option value="">Select student</option>
                  {filteredStudents.map(s => (
                    <option key={s.id} value={s.id}>{s.user.full_name} — {s.section_name}</option>
                  ))}
                </select>
                {!paymentForm.assessment && <small className="text-muted">Select an assessment first</small>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="pm_amount">Amount (PHP) <span className="required">*</span></label>
                <input id="pm_amount" type="number" step="0.01" min="0.01"
                  value={paymentForm.amount || autoAmount}
                  onChange={e => handlePaymentChange('amount', e.target.value)}
                  placeholder="e.g. 5000.00" required />
              </div>
              <div className="form-group">
                <label htmlFor="pm_date">Payment Date <span className="required">*</span></label>
                <input id="pm_date" type="date" value={paymentForm.payment_date}
                  onChange={e => handlePaymentChange('payment_date', e.target.value)} required />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="pm_method">Payment Method</label>
                <select id="pm_method" value={paymentForm.payment_method} onChange={e => handlePaymentChange('payment_method', e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="check">Check</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="online">Online</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="pm_reference">Reference Number</label>
                <input id="pm_reference" type="text"
                  value={paymentForm.reference_number}
                  onChange={e => handlePaymentChange('reference_number', e.target.value)}
                  placeholder="Optional check/transaction ref" />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="pm_notes">Notes</label>
              <textarea id="pm_notes" rows={3}
                value={paymentForm.notes}
                onChange={e => handlePaymentChange('notes', e.target.value)}
                placeholder="Optional notes" />
            </div>

            <div className="form-actions">
              <Button type="button" variant="secondary" onClick={closePaymentModal} disabled={paymentLoading}>Cancel</Button>
              <Button type="submit" variant="primary" loading={paymentLoading}>
                {paymentLoading ? 'Recording...' : 'Record Payment'}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    )
  }

  // --- Reports Tab (placeholder) ---
  return (
    <div className="page">
      <PageHeader title="Fee Management" subtitle="Reports coming soon" />
      <EmptyState title="Reports" description="Collection and outstanding reports coming soon." />
    </div>
  )
}