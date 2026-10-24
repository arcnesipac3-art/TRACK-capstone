import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../services/api'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import LoadingSpinner from '../components/LoadingSpinner'
import Icon from '../components/Icon'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Card from '../components/dashboard/Card'
import { formatCurrency, formatDate } from '../utils/format'

const TABS = ['dashboard', 'categories', 'assessments', 'payments', 'reports']
const REQUIRED = <span style={{ color: 'var(--red-700)' }}>*</span>

function initialPaymentForm() {
  return {
    assessment: '',
    student: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    reference_number: '',
    notes: '',
  }
}

/**
 * Admin Fee Management — Dashboard, Categories, Assessments, Payments, Reports.
 *
 * Includes a single reusable "Record Payment" modal, a printable receipt
 * modal, void/refund actions with audit reason, and CSV report export.
 * The active tab is kept in the `?tab=` query param so detail pages can
 * deep-link back to the right section after saving.
 */
export default function AdminFeesPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab = TABS.includes(tabParam) ? tabParam : 'dashboard'
  const setActiveTab = (tab) => setSearchParams(tab === 'dashboard' ? {} : { tab })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Data
  const [categories, setCategories] = useState([])
  const [assessments, setAssessments] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [students, setStudents] = useState([])
  const [sections, setSections] = useState([])
  const [schoolYears, setSchoolYears] = useState([])

  // Payments tab
  const [payments, setPayments] = useState([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)

  // List filters (client-side over the loaded pages)
  const [assessSearch, setAssessSearch] = useState('')
  const [assessStatus, setAssessStatus] = useState('')
  const [paySearch, setPaySearch] = useState('')
  const [payStatus, setPayStatus] = useState('')

  // Reports tab (server-side filters — reports are aggregates)
  const [reportYear, setReportYear] = useState('')
  const [reportCategory, setReportCategory] = useState('')
  const [reports, setReports] = useState({ collection: [], outstanding: [] })
  const [reportsLoading, setReportsLoading] = useState(false)

  // Payment modal
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState(null)
  const [paymentForm, setPaymentForm] = useState(initialPaymentForm)

  // Receipt modal
  const [receipt, setReceipt] = useState(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [receiptError, setReceiptError] = useState(null)

  // Void/refund modal
  const [voidTarget, setVoidTarget] = useState(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidAction, setVoidAction] = useState('voided')
  const [voidLoading, setVoidLoading] = useState(false)
  const [voidError, setVoidError] = useState(null)

  const load = useCallback(async () => {
    try {
      const [cats, asses, dash, studs, secs, sys] = await Promise.all([
        api.list('/fee-categories/'),
        api.list('/fee-assessments/'),
        api.get('/fee-dashboard/'),
        api.list('/students/'),
        api.list('/sections/'),
        api.list('/school-years/'),
      ])
      setCategories(cats)
      setAssessments(asses)
      setDashboard(dash)
      setStudents(studs)
      setSections(secs)
      setSchoolYears(sys)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load fee data.')
    } finally {
      setLoading(false)
    }
  }, [])

  // `load` writes state only after its requests resolve; queueMicrotask keeps
  // the kickoff off the effect's synchronous pass.
  useEffect(() => { queueMicrotask(load) }, [load])

  const loadPayments = useCallback(async () => {
    setPaymentsLoading(true)
    try {
      const data = await api.list('/fee-payments/')
      setPayments(data)
    } catch (err) {
      console.error('Failed to load payments:', err)
    } finally {
      setPaymentsLoading(false)
    }
  }, [])

  const loadReports = useCallback(async () => {
    setReportsLoading(true)
    try {
      const params = {
        school_year: reportYear || undefined,
        category: reportCategory || undefined,
      }
      const [collection, outstanding] = await Promise.all([
        api.get('/fee-reports/collection/', { params }),
        api.get('/fee-reports/outstanding/', { params }),
      ])
      setReports({
        collection: collection.results || collection,
        outstanding: outstanding.results || outstanding,
      })
    } catch (err) {
      console.error('Failed to load reports:', err)
    } finally {
      setReportsLoading(false)
    }
  }, [reportYear, reportCategory])

  // Activating a tab must flip its loading state before the request fires,
  // or switching to an unloaded tab would show stale content with no
  // spinner — the loaders begin with that flip, and queueMicrotask runs the
  // kickoff outside the effect's synchronous pass.
  useEffect(() => {
    if (activeTab === 'payments') queueMicrotask(loadPayments)
    if (activeTab === 'reports') queueMicrotask(loadReports)
  }, [activeTab, loadPayments, loadReports])

  /* ------------------------------------------------------------------ */
  /* Client-side list filters                                            */
  /* ------------------------------------------------------------------ */

  const includesQuery = (values, query) =>
    !query || values.some((v) => (v || '').toLowerCase().includes(query))

  const visibleAssessments = useMemo(() => {
    const query = assessSearch.trim().toLowerCase()
    return assessments.filter(
      (a) =>
        (!assessStatus || a.status === assessStatus) &&
        includesQuery(
          [a.category_name, a.category_code, a.student_name, a.section_name, a.grade_level_name],
          query
        )
    )
  }, [assessments, assessSearch, assessStatus])

  const visiblePayments = useMemo(() => {
    const query = paySearch.trim().toLowerCase()
    return payments.filter(
      (p) =>
        (!payStatus || p.status === payStatus) &&
        includesQuery(
          [p.student_name, p.receipt_number, p.assessment_category, p.reference_number],
          query
        )
    )
  }, [payments, paySearch, payStatus])

  /* ------------------------------------------------------------------ */
  /* Payment modal                                                       */
  /* ------------------------------------------------------------------ */

  const openPaymentModal = (prefill = {}) => {
    const next = { ...initialPaymentForm(), ...prefill }
    if (next.assessment && !next.amount) {
      const match = assessments.find((a) => a.id == next.assessment)
      if (match) next.amount = String(match.amount)
    }
    setPaymentForm(next)
    setPaymentError(null)
    setPaymentModalOpen(true)
  }

  const closePaymentModal = () => {
    setPaymentModalOpen(false)
    setPaymentError(null)
  }

  const handlePaymentChange = (field, value) => {
    setPaymentForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleAssessmentChange = (value) => {
    const match = assessments.find((a) => a.id == value)
    setPaymentForm((prev) => ({
      ...prev,
      assessment: value,
      amount: match ? String(match.amount) : '',
    }))
  }

  const handlePaymentSubmit = async (e) => {
    e.preventDefault()
    const amountValue = parseFloat(paymentForm.amount)
    if (
      !paymentForm.assessment ||
      !paymentForm.student ||
      !paymentForm.payment_date ||
      Number.isNaN(amountValue) ||
      amountValue <= 0
    ) {
      setPaymentError('Assessment, student, a positive amount, and date are required.')
      return
    }
    setPaymentLoading(true)
    setPaymentError(null)
    try {
      const payload = {
        assessment: Number(paymentForm.assessment),
        student: Number(paymentForm.student),
        amount: amountValue.toFixed(2),
        payment_date: paymentForm.payment_date,
        payment_method: paymentForm.payment_method,
        reference_number: paymentForm.reference_number || '',
        notes: paymentForm.notes || '',
      }
      await api.post('/fee-payments/', payload)
      closePaymentModal()
      load()
      if (activeTab === 'payments') loadPayments()
    } catch (err) {
      setPaymentError(err instanceof ApiError ? err.message : 'Could not record payment.')
    } finally {
      setPaymentLoading(false)
    }
  }

  // Limit students to the selected assessment's scope.
  const filteredStudents = useMemo(() => {
    if (!paymentForm.assessment) return students
    const assessment = assessments.find((a) => a.id == paymentForm.assessment)
    if (!assessment) return students
    if (assessment.student) return students.filter((s) => s.id == assessment.student)
    if (assessment.section) return students.filter((s) => s.section == assessment.section)
    if (assessment.grade_level) {
      const gradeSections = sections
        .filter((s) => s.grade_level == assessment.grade_level && s.school_year == assessment.school_year)
        .map((s) => s.id)
      return students.filter((s) => gradeSections.includes(s.section))
    }
    if (assessment.school_year) {
      const sySections = sections.filter((s) => s.school_year == assessment.school_year).map((s) => s.id)
      return students.filter((s) => sySections.includes(s.section))
    }
    return students
  }, [paymentForm.assessment, assessments, students, sections])

  /* ------------------------------------------------------------------ */
  /* Receipt modal                                                       */
  /* ------------------------------------------------------------------ */

  const openReceipt = async (paymentId) => {
    setReceiptLoading(true)
    setReceiptError(null)
    setReceipt(null)
    try {
      const data = await api.get(`/fee-payments/${paymentId}/`)
      setReceipt(data)
    } catch (err) {
      setReceiptError(err instanceof ApiError ? err.message : 'Could not load receipt.')
    } finally {
      setReceiptLoading(false)
    }
  }

  const closeReceipt = () => {
    setReceipt(null)
    setReceiptError(null)
    setReceiptLoading(false)
  }

  /* ------------------------------------------------------------------ */
  /* Void/refund                                                         */
  /* ------------------------------------------------------------------ */

  const openVoid = (payment, action) => {
    setVoidTarget(payment)
    setVoidAction(action)
    setVoidReason('')
    setVoidError(null)
  }

  const handleVoidSubmit = async (e) => {
    e.preventDefault()
    if (!voidReason.trim()) {
      setVoidError('A reason is required for the audit trail.')
      return
    }
    setVoidLoading(true)
    setVoidError(null)
    try {
      await api.patch(`/fee-payments/${voidTarget.id}/`, {
        status: voidAction,
        void_reason: voidReason.trim(),
      })
      setVoidTarget(null)
      loadPayments()
      load()
    } catch (err) {
      setVoidError(err instanceof ApiError ? err.message : 'Could not update payment.')
    } finally {
      setVoidLoading(false)
    }
  }

  const handleDeleteCategory = async (id) => {
    if (!window.confirm('Delete this fee category?')) return
    try {
      await api.delete(`/fee-categories/${id}/`)
      setCategories((prev) => prev.filter((c) => c.id !== id))
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not delete category.')
    }
  }

  /* ------------------------------------------------------------------ */
  /* CSV export                                                          */
  /* ------------------------------------------------------------------ */

  const downloadCsv = (rows, filename, headers) => {
    if (!rows || rows.length === 0) return
    const escape = (v) => {
      const s = v === null || v === undefined ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [
      headers.map((h) => escape(h.label)).join(','),
      ...rows.map((row) => headers.map((h) => escape(h.get(row))).join(',')),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportCollection = () =>
    downloadCsv(reports.collection, 'fee-collection-report.csv', [
      { label: 'School Year', get: (r) => r.school_year },
      { label: 'Category', get: (r) => r.category },
      { label: 'Total Assessed', get: (r) => r.total_assessed },
      { label: 'Total Collected', get: (r) => r.total_collected },
      { label: 'Total Outstanding', get: (r) => r.total_outstanding },
      { label: 'Collection Rate (%)', get: (r) => r.collection_rate },
      { label: 'Students', get: (r) => r.student_count },
      { label: 'Paid', get: (r) => r.paid_count },
      { label: 'Partial', get: (r) => r.partial_count },
      { label: 'Unpaid', get: (r) => r.unpaid_count },
    ])

  const exportOutstanding = () =>
    downloadCsv(reports.outstanding, 'fee-outstanding-report.csv', [
      { label: 'Student', get: (r) => r.student_name },
      { label: 'LRN', get: (r) => r.lrn },
      { label: 'Section', get: (r) => r.section },
      { label: 'Category', get: (r) => r.category },
      { label: 'Assessed', get: (r) => r.assessed },
      { label: 'Paid', get: (r) => r.paid },
      { label: 'Outstanding', get: (r) => r.outstanding },
      { label: 'Due Date', get: (r) => r.due_date },
      { label: 'Status', get: (r) => r.payment_status },
    ])

  /* ------------------------------------------------------------------ */
  /* Early states                                                        */
  /* ------------------------------------------------------------------ */

  if (loading) return <LoadingSpinner block size="lg" label="Loading fee management…" />
  if (error) {
    return (
      <div className="stack stack-md">
        <PageHeader title="Fee Management" />
        <ErrorMessage error={error} title="Could not load fee data" onRetry={load} />
      </div>
    )
  }

  /* ------------------------------------------------------------------ */
  /* Page header (per tab)                                               */
  /* ------------------------------------------------------------------ */

  const pageHeader = (() => {
    switch (activeTab) {
      case 'categories':
        return {
          title: 'Fee Categories',
          subtitle: `${categories.length} ${categories.length === 1 ? 'category' : 'categories'}`,
          actions: (
            <Button variant="primary" onClick={() => navigate('/admin/fees/categories/new')}>
              <Icon name="plus" size={16} /> New Category
            </Button>
          ),
        }
      case 'assessments':
        return {
          title: 'Fee Assessments',
          subtitle: `Showing ${visibleAssessments.length} of ${assessments.length}`,
          actions: (
            <>
              <Button variant="secondary" onClick={() => openPaymentModal()}>
                <Icon name="creditCard" size={16} /> Record Payment
              </Button>
              <Button variant="primary" onClick={() => navigate('/admin/fees/assessments/new')}>
                <Icon name="plus" size={16} /> New Assessment
              </Button>
            </>
          ),
        }
      case 'payments':
        return {
          title: 'All Payments',
          subtitle: `Showing ${visiblePayments.length} of ${payments.length} payments`,
          actions: (
            <Button variant="primary" onClick={() => openPaymentModal()}>
              <Icon name="plus" size={16} /> Record Payment
            </Button>
          ),
        }
      case 'reports':
        return {
          title: 'Fee Reports',
          subtitle: 'Collection and outstanding balance reports',
        }
      default:
        return {
          title: 'Fee Management',
          subtitle: dashboard
            ? `${formatCurrency(dashboard.total_outstanding)} outstanding across ${dashboard.total_students_assessed} students`
            : 'Fee management dashboard',
          actions: (
            <>
              <Button variant="secondary" onClick={() => navigate('/admin/fees/categories/new')}>
                <Icon name="plus" size={16} /> New Category
              </Button>
              <Button variant="primary" onClick={() => openPaymentModal()}>
                <Icon name="creditCard" size={16} /> Record Payment
              </Button>
            </>
          ),
        }
    }
  })()

  /* ------------------------------------------------------------------ */
  /* Tab content                                                         */
  /* ------------------------------------------------------------------ */

  const renderDashboard = () => (
    <>
      <div className="grid grid-4">
        <StatCard
          label="Total Assessed"
          value={formatCurrency(dashboard?.total_assessed)}
          hint="Published fee assessments"
        />
        <StatCard
          label="Total Collected"
          value={formatCurrency(dashboard?.total_collected)}
          tone="green"
          hint="Completed payments"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(dashboard?.total_outstanding)}
          tone="amber"
          hint="Unpaid balances"
        />
        <StatCard
          label="Students w/ Balance"
          value={dashboard?.students_with_balance ?? 0}
          tone="red"
          hint={`of ${dashboard?.total_students_assessed ?? 0} assessed`}
        />
      </div>

      <Card
        title="By Category"
        flush
        empty={
          dashboard?.category_breakdown?.length ? null : (
            <EmptyState
              icon="chart"
              title="No category data"
              message="Assessed fees appear here once assessments are published."
            />
          )
        }
      >
        <div className="table-wrap">
          <table className="table responsive-table">
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
              {(dashboard?.category_breakdown || []).map((cat) => (
                <tr key={cat.code}>
                  <td data-label="Category" className="cell-main">
                    {cat.category}
                    <br />
                    <small className="muted">{cat.code}</small>
                  </td>
                  <td data-label="Assessed">{formatCurrency(cat.assessed)}</td>
                  <td data-label="Collected">{formatCurrency(cat.collected)}</td>
                  <td data-label="Outstanding">{formatCurrency(cat.outstanding)}</td>
                  <td data-label="Rate">
                    <span
                      className={`badge ${
                        cat.assessed > 0 && cat.collected / cat.assessed > 0.8
                          ? 'badge-success'
                          : 'badge-warning'
                      }`}
                    >
                      {cat.assessed > 0 ? Math.round((cat.collected / cat.assessed) * 100) : 0}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Recent Payments"
        flush
        empty={
          dashboard?.recent_payments?.length ? null : (
            <EmptyState
              icon="creditCard"
              title="No payments yet"
              message="Recorded payments will appear here."
              action={
                <Button variant="primary" onClick={() => openPaymentModal()}>
                  <Icon name="plus" size={14} /> Record Payment
                </Button>
              }
            />
          )
        }
      >
        <div className="table-wrap">
          <table className="table responsive-table">
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
              {(dashboard?.recent_payments || []).map((p) => (
                <tr key={p.id}>
                  <td data-label="Student" className="cell-main">
                    {p.student}
                  </td>
                  <td data-label="Category">{p.category}</td>
                  <td data-label="Amount">{formatCurrency(p.amount)}</td>
                  <td data-label="Date">{formatDate(p.payment_date)}</td>
                  <td data-label="Method">
                    <span className="badge">{p.payment_method}</span>
                  </td>
                  <td data-label="Receipt">
                    <code>{p.receipt_number}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )

  const renderCategories = () => (
    <Card
      title="Fee Categories"
      flush
      empty={
        categories.length === 0 ? (
          <EmptyState
            icon="layers"
            title="No categories"
            message="Create a fee category to get started."
            action={
              <Button variant="primary" onClick={() => navigate('/admin/fees/categories/new')}>
                Create Category
              </Button>
            }
          />
        ) : null
      }
    >
      <div className="table-wrap">
        <table className="table responsive-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Assessments</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat.id}>
                <td data-label="Name" className="cell-main">
                  <strong>{cat.name}</strong>
                  <br />
                  <small className="muted">
                    <code>{cat.code}</code>
                  </small>
                </td>
                <td data-label="Type">
                  <span
                    className={`badge ${cat.fee_type === 'compulsory' ? 'badge-warning' : 'badge-info'}`}
                  >
                    {cat.fee_type === 'compulsory' ? 'Compulsory' : 'Voluntary'}
                  </span>
                </td>
                <td data-label="Status">
                  <span className={`badge ${cat.is_active ? 'badge-success' : 'badge-secondary'}`}>
                    {cat.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td data-label="Assessments">{cat.assessment_count}</td>
                <td data-label="Actions">
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => navigate(`/admin/fees/categories/${cat.id}`)}
                    >
                      <Icon name="pencil" size={14} /> Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDeleteCategory(cat.id)}
                    >
                      <Icon name="trash" size={14} /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )

  const renderAssessments = () => (
    <>
      <div className="filter-bar">
        <div className="field grow" style={{ minWidth: 220 }}>
          <label htmlFor="assess_search">Search</label>
          <input
            id="assess_search"
            className="input"
            type="search"
            placeholder="Category, code, student, or section"
            value={assessSearch}
            onChange={(e) => setAssessSearch(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="assess_status">Status</label>
          <select
            id="assess_status"
            className="select"
            value={assessStatus}
            onChange={(e) => setAssessStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        {(assessSearch || assessStatus) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAssessSearch('')
              setAssessStatus('')
            }}
          >
            Clear
          </Button>
        )}
      </div>

      <Card
        title={`Assessments (${visibleAssessments.length})`}
        flush
        empty={
          assessments.length === 0 ? (
            <EmptyState
              icon="clipboard"
              title="No assessments"
              message="Create an assessment to assign fees to a year, grade, section, or student."
              action={
                <Button variant="primary" onClick={() => navigate('/admin/fees/assessments/new')}>
                  Create Assessment
                </Button>
              }
            />
          ) : visibleAssessments.length === 0 ? (
            <EmptyState
              icon="search"
              title="No matches"
              message="No assessments match your search or filter."
            />
          ) : null
        }
      >
        <div className="table-wrap">
          <table className="table responsive-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Amount</th>
                <th>Due Date</th>
                <th>Scope</th>
                <th>Status</th>
                <th>Collected / Assessed</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleAssessments.map((a) => (
                <tr key={a.id}>
                  <td data-label="Category" className="cell-main">
                    <strong>{a.category_name}</strong>
                    <br />
                    <small className="muted">{a.category_code}</small>
                  </td>
                  <td data-label="Amount">{formatCurrency(a.amount)}</td>
                  <td data-label="Due Date">{formatDate(a.due_date)}</td>
                  <td data-label="Scope">
                    <div className="row row-wrap" style={{ gap: 6 }}>
                      {a.grade_level_name && <span className="badge badge-info">{a.grade_level_name}</span>}
                      {a.section_name && <span className="badge badge-secondary">{a.section_name}</span>}
                      {a.student_name && <span className="badge badge-blue">{a.student_name}</span>}
                      {!a.grade_level_name && !a.section_name && !a.student_name && (
                        <span className="badge badge-secondary">School-wide</span>
                      )}
                    </div>
                  </td>
                  <td data-label="Status">
                    <span
                      className={`badge ${
                        a.status === 'published'
                          ? 'badge-success'
                          : a.status === 'archived'
                            ? 'badge-secondary'
                            : 'badge-warning'
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td data-label="Collected / Assessed">
                    {formatCurrency(a.total_collected)} / {formatCurrency(a.total_assessed)}
                  </td>
                  <td data-label="Actions">
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => navigate(`/admin/fees/assessments/${a.id}`)}
                      >
                        <Icon name="pencil" size={14} /> Edit
                      </button>
                      {a.status === 'published' && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => openPaymentModal({ assessment: a.id })}
                        >
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
      </Card>
    </>
  )

  const renderPayments = () => (
    <>
      <div className="filter-bar">
        <div className="field grow" style={{ minWidth: 220 }}>
          <label htmlFor="pay_search">Search</label>
          <input
            id="pay_search"
            className="input"
            type="search"
            placeholder="Student, receipt no., or category"
            value={paySearch}
            onChange={(e) => setPaySearch(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="pay_status">Status</label>
          <select
            id="pay_status"
            className="select"
            value={payStatus}
            onChange={(e) => setPayStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="voided">Voided</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>
        {(paySearch || payStatus) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPaySearch('')
              setPayStatus('')
            }}
          >
            Clear
          </Button>
        )}
      </div>

      <Card
        title={`Payments (${visiblePayments.length})`}
        flush
        loading={paymentsLoading}
        empty={
          payments.length === 0 ? (
            <EmptyState
              icon="creditCard"
              title="No payments recorded"
              message="Record the first payment to get started."
              action={
                <Button variant="primary" onClick={() => openPaymentModal()}>
                  <Icon name="plus" size={14} /> Record Payment
                </Button>
              }
            />
          ) : visiblePayments.length === 0 ? (
            <EmptyState
              icon="search"
              title="No matches"
              message="No payments match your search or filter."
            />
          ) : null
        }
      >
        <div className="table-wrap">
          <table className="table responsive-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Method</th>
                <th>Receipt</th>
                <th>Status</th>
                <th>Recorded By</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visiblePayments.map((p) => (
                <tr key={p.id}>
                  <td data-label="Student" className="cell-main">
                    {p.student_name}
                  </td>
                  <td data-label="Category">{p.assessment_category}</td>
                  <td data-label="Amount">{formatCurrency(p.amount)}</td>
                  <td data-label="Date">{formatDate(p.payment_date)}</td>
                  <td data-label="Method">
                    <span className="badge">{p.payment_method}</span>
                  </td>
                  <td data-label="Receipt">
                    <code>{p.receipt_number}</code>
                  </td>
                  <td data-label="Status">
                    <span
                      className={`badge ${
                        p.status === 'completed'
                          ? 'badge-success'
                          : p.status === 'voided'
                            ? 'badge-error'
                            : p.status === 'refunded'
                              ? 'badge-warning'
                              : 'badge-secondary'
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td data-label="Recorded By">{p.recorded_by_name || '—'}</td>
                  <td data-label="Actions">
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => openReceipt(p.id)}
                        title="View receipt"
                      >
                        <Icon name="eye" size={14} /> Receipt
                      </button>
                      {p.status === 'completed' && (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => openVoid(p, 'voided')}
                            title="Void payment"
                          >
                            <Icon name="close" size={14} /> Void
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => openVoid(p, 'refunded')}
                            title="Refund payment"
                          >
                            <Icon name="undo" size={14} /> Refund
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )

  const renderReports = () => (
    <>
      <div className="filter-bar">
        <div className="field">
          <label htmlFor="rep_year">School Year</label>
          <select
            id="rep_year"
            className="select"
            value={reportYear}
            onChange={(e) => setReportYear(e.target.value)}
          >
            <option value="">All school years</option>
            {schoolYears.map((sy) => (
              <option key={sy.id} value={sy.id}>
                {sy.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rep_category">Category</label>
          <select
            id="rep_category"
            className="select"
            value={reportCategory}
            onChange={(e) => setReportCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {(reportYear || reportCategory) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setReportYear('')
              setReportCategory('')
            }}
          >
            Clear
          </Button>
        )}
      </div>

      <Card
        title="Collection Report"
        loading={reportsLoading}
        flush
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={exportCollection}
            disabled={reports.collection.length === 0}
          >
            <Icon name="download" size={14} /> Export CSV
          </Button>
        }
        empty={
          !reportsLoading && reports.collection.length === 0 ? (
            <EmptyState
              icon="chart"
              title="No collection data"
              message="Collection totals appear once assessments are published."
            />
          ) : null
        }
      >
        <div className="table-wrap">
          <table className="table responsive-table">
            <thead>
              <tr>
                <th>School Year</th>
                <th>Category</th>
                <th>Assessed</th>
                <th>Collected</th>
                <th>Outstanding</th>
                <th>Rate</th>
                <th>Paid / Partial / Unpaid</th>
              </tr>
            </thead>
            <tbody>
              {reports.collection.map((r, i) => (
                <tr key={i}>
                  <td data-label="School Year" className="cell-main">
                    {r.school_year}
                  </td>
                  <td data-label="Category">{r.category}</td>
                  <td data-label="Assessed">{formatCurrency(r.total_assessed)}</td>
                  <td data-label="Collected">{formatCurrency(r.total_collected)}</td>
                  <td data-label="Outstanding">{formatCurrency(r.total_outstanding)}</td>
                  <td data-label="Rate">
                    <span
                      className={`badge ${r.collection_rate > 80 ? 'badge-success' : 'badge-warning'}`}
                    >
                      {r.collection_rate}%
                    </span>
                  </td>
                  <td data-label="Paid / Partial / Unpaid">
                    {r.paid_count} / {r.partial_count} / {r.unpaid_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Outstanding Balances"
        loading={reportsLoading}
        flush
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={exportOutstanding}
            disabled={reports.outstanding.length === 0}
          >
            <Icon name="download" size={14} /> Export CSV
          </Button>
        }
        empty={
          !reportsLoading && reports.outstanding.length === 0 ? (
            <EmptyState
              icon="users"
              title="No outstanding balances"
              message="Every assessed fee has been paid in full."
            />
          ) : null
        }
      >
        <div className="table-wrap">
          <table className="table responsive-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>LRN</th>
                <th>Section</th>
                <th>Category</th>
                <th>Assessed</th>
                <th>Paid</th>
                <th>Outstanding</th>
                <th>Due Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {reports.outstanding.map((r, i) => (
                <tr key={i}>
                  <td data-label="Student" className="cell-main">
                    {r.student_name}
                  </td>
                  <td data-label="LRN">{r.lrn || '—'}</td>
                  <td data-label="Section">{r.section}</td>
                  <td data-label="Category">{r.category}</td>
                  <td data-label="Assessed">{formatCurrency(r.assessed)}</td>
                  <td data-label="Paid">{formatCurrency(r.paid)}</td>
                  <td data-label="Outstanding">{formatCurrency(r.outstanding)}</td>
                  <td data-label="Due Date">{formatDate(r.due_date)}</td>
                  <td data-label="Status">
                    <span
                      className={`badge ${
                        r.payment_status === 'paid'
                          ? 'badge-success'
                          : r.payment_status === 'partial'
                            ? 'badge-warning'
                            : 'badge-error'
                      }`}
                    >
                      {r.payment_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )

  const tabContent = {
    dashboard: renderDashboard,
    categories: renderCategories,
    assessments: renderAssessments,
    payments: renderPayments,
    reports: renderReports,
  }[activeTab]

  return (
    <div className="stack stack-md">
      <PageHeader {...pageHeader} />

      <div className="tabs" role="tablist" aria-label="Fee management sections">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {tabContent()}

      {/* Payment Modal */}
      <Modal
        open={paymentModalOpen}
        onClose={closePaymentModal}
        title="Record Payment"
        width={720}
        footer={
          <>
            <Button variant="secondary" onClick={closePaymentModal} disabled={paymentLoading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handlePaymentSubmit} loading={paymentLoading}>
              {paymentLoading ? 'Recording…' : 'Record Payment'}
            </Button>
          </>
        }
      >
        <form onSubmit={handlePaymentSubmit} className="stack stack-sm">
          {paymentError && <ErrorMessage error={paymentError} compact />}

          <div className="row row-wrap" style={{ gap: 12 }}>
            <div className="field grow" style={{ minWidth: '240px' }}>
              <label htmlFor="pm_assessment">Assessment {REQUIRED}</label>
              <select
                id="pm_assessment"
                className="select"
                value={paymentForm.assessment}
                onChange={(e) => handleAssessmentChange(e.target.value)}
                required
              >
                <option value="">Select assessment</option>
                {assessments
                  .filter((a) => a.status === 'published')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.category_name} — {formatCurrency(a.amount)} —{' '}
                      {a.grade_level_name || 'School-wide'}
                      {a.section_name ? ` · ${a.section_name}` : ''}
                      {a.student_name ? ` · ${a.student_name}` : ''}
                    </option>
                  ))}
              </select>
            </div>

            <div className="field grow" style={{ minWidth: '240px' }}>
              <label htmlFor="pm_student">Student {REQUIRED}</label>
              <select
                id="pm_student"
                className="select"
                value={paymentForm.student}
                onChange={(e) => handlePaymentChange('student', e.target.value)}
                required
                disabled={!paymentForm.assessment}
              >
                <option value="">Select student</option>
                {filteredStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.user?.full_name || s.full_name} — {s.section_name}
                  </option>
                ))}
              </select>
              {!paymentForm.assessment && <span className="hint">Select an assessment first</span>}
            </div>
          </div>

          <div className="row row-wrap" style={{ gap: 12 }}>
            <div className="field" style={{ minWidth: '180px' }}>
              <label htmlFor="pm_amount">Amount (PHP) {REQUIRED}</label>
              <input
                id="pm_amount"
                className="input"
                type="number"
                step="0.01"
                min="0.01"
                value={paymentForm.amount}
                onChange={(e) => handlePaymentChange('amount', e.target.value)}
                placeholder="e.g. 5000.00"
                required
              />
            </div>
            <div className="field" style={{ minWidth: '180px' }}>
              <label htmlFor="pm_date">Payment Date {REQUIRED}</label>
              <input
                id="pm_date"
                className="input"
                type="date"
                value={paymentForm.payment_date}
                onChange={(e) => handlePaymentChange('payment_date', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="row row-wrap" style={{ gap: 12 }}>
            <div className="field" style={{ minWidth: '180px' }}>
              <label htmlFor="pm_method">Payment Method</label>
              <select
                id="pm_method"
                className="select"
                value={paymentForm.payment_method}
                onChange={(e) => handlePaymentChange('payment_method', e.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="online">Online</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="field grow" style={{ minWidth: '180px' }}>
              <label htmlFor="pm_reference">Reference Number</label>
              <input
                id="pm_reference"
                className="input"
                type="text"
                value={paymentForm.reference_number}
                onChange={(e) => handlePaymentChange('reference_number', e.target.value)}
                placeholder="Optional check/transaction ref"
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="pm_notes">Notes</label>
            <textarea
              id="pm_notes"
              className="textarea"
              rows={3}
              value={paymentForm.notes}
              onChange={(e) => handlePaymentChange('notes', e.target.value)}
              placeholder="Optional notes"
            />
          </div>
        </form>
      </Modal>

      {/* Receipt Modal */}
      <Modal
        open={receiptLoading || receiptError !== null || !!receipt}
        onClose={closeReceipt}
        title="Payment Receipt"
        width={520}
        footer={
          receipt && (
            <>
              <Button variant="secondary" onClick={closeReceipt}>
                Close
              </Button>
              <Button variant="primary" onClick={() => window.print()}>
                <Icon name="printer" size={14} /> Print
              </Button>
            </>
          )
        }
      >
        {receiptLoading && <LoadingSpinner block label="Loading receipt…" />}
        {receiptError && <ErrorMessage error={receiptError} compact />}
        {receipt && (
          <div className="receipt-print">
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Kiwalan National High School</h3>
              <p className="muted" style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}>
                Official Payment Receipt
              </p>
            </div>
            <table className="receipt-table">
              <tbody>
                <tr>
                  <td>Receipt No.</td>
                  <td>
                    <code>{receipt.receipt_number}</code>
                  </td>
                </tr>
                <tr>
                  <td>Date</td>
                  <td>{formatDate(receipt.payment_date)}</td>
                </tr>
                <tr>
                  <td>Student</td>
                  <td>{receipt.student_name}</td>
                </tr>
                <tr>
                  <td>LRN</td>
                  <td>{receipt.student_lrn || '—'}</td>
                </tr>
                <tr>
                  <td>Section</td>
                  <td>{receipt.section_name || '—'}</td>
                </tr>
                <tr>
                  <td>Fee Category</td>
                  <td>{receipt.assessment_category}</td>
                </tr>
                <tr>
                  <td>Amount Paid</td>
                  <td>
                    <strong>{formatCurrency(receipt.amount)}</strong>
                  </td>
                </tr>
                <tr>
                  <td>Method</td>
                  <td>{receipt.payment_method}</td>
                </tr>
                {receipt.reference_number && (
                  <tr>
                    <td>Reference</td>
                    <td>{receipt.reference_number}</td>
                  </tr>
                )}
                {receipt.notes && (
                  <tr>
                    <td>Notes</td>
                    <td>{receipt.notes}</td>
                  </tr>
                )}
                <tr>
                  <td>Recorded By</td>
                  <td>{receipt.recorded_by_name || '—'}</td>
                </tr>
                {receipt.status !== 'completed' && (
                  <tr>
                    <td>Status</td>
                    <td>
                      <span className="badge badge-warning">{receipt.status}</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Void/Refund Modal */}
      <Modal
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        title={voidAction === 'voided' ? 'Void Payment' : 'Refund Payment'}
        width={480}
        footer={
          <>
            <Button variant="secondary" onClick={() => setVoidTarget(null)} disabled={voidLoading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleVoidSubmit} loading={voidLoading}>
              {voidAction === 'voided' ? 'Void Payment' : 'Refund Payment'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleVoidSubmit} className="stack stack-sm">
          {voidError && <ErrorMessage error={voidError} compact />}
          {voidTarget && (
            <p className="muted" style={{ fontSize: '0.92rem', margin: 0 }}>
              {voidAction === 'voided' ? 'Void' : 'Refund'} payment{' '}
              <code>{voidTarget.receipt_number}</code> for{' '}
              <strong>{formatCurrency(voidTarget.amount)}</strong> ({voidTarget.student_name})? This
              is recorded in the audit trail.
            </p>
          )}
          <div className="field">
            <label htmlFor="void_reason">Reason {REQUIRED}</label>
            <textarea
              id="void_reason"
              className="textarea"
              rows={3}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Why is this payment being reversed?"
              required
            />
          </div>
        </form>
      </Modal>
    </div>
  )
}
