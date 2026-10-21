import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../services/api'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import LoadingSpinner from '../components/LoadingSpinner'
import Button from '../components/Button'
import { formatCurrency } from '../utils/format'

/**
 * Admin Fee Assessment Detail — Create/Edit
 */
export default function AdminFeeAssessmentDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isNew = id === 'new'

  const [assessment, setAssessment] = useState({
    category: '',
    school_year: '',
    grade_level: '',
    section: '',
    student: '',
    amount: '',
    due_date: '',
    status: 'draft',
    description: '',
  })
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Reference data
  const [categories, setCategories] = useState([])
  const [schoolYears, setSchoolYears] = useState([])
  const [gradeLevels, setGradeLevels] = useState([])
  const [sections, setSections] = useState([])
  const [students, setStudents] = useState([])

  const loadRefs = useCallback(async () => {
    try {
      const [cats, sys, gls, secs, studs] = await Promise.all([
        api.list('/fee-categories/'),
        api.list('/school-years/'),
        api.list('/grade-levels/'),
        api.list('/sections/'),
        api.list('/students/'),
      ])
      setCategories(cats)
      setSchoolYears(sys)
      setGradeLevels(gls)
      setSections(secs)
      setStudents(studs)
      if (isNew && sys.length > 0) {
        const activeSY = sys.find(s => s.is_active) || sys[0]
        setAssessment(prev => ({ ...prev, school_year: activeSY.id }))
      }
    } catch (err) { console.error('Failed to load refs:', err) }
  }, [isNew])

  const load = useCallback(async () => {
    if (isNew) { setLoading(false); return }
    try {
      const data = await api.get(`/fee-assessments/${id}/`)
      setAssessment({
        category: data.category,
        school_year: data.school_year,
        grade_level: data.grade_level || '',
        section: data.section || '',
        student: data.student || '',
        amount: String(data.amount),
        due_date: data.due_date,
        status: data.status,
        description: data.description || '',
      })
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load assessment.')
    } finally { setLoading(false) }
  }, [id, isNew])

  useEffect(() => { loadRefs() }, [loadRefs])
  useEffect(() => { load() }, [load])

  const handleChange = (field, value) => setAssessment(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!assessment.category || !assessment.school_year || !assessment.amount || !assessment.due_date) {
      alert('Category, school year, amount, and due date are required.'); return
    }
    setSaving(true)
    try {
      const payload = {
        category: Number(assessment.category),
        school_year: Number(assessment.school_year),
        grade_level: assessment.grade_level ? Number(assessment.grade_level) : undefined,
        section: assessment.section ? Number(assessment.section) : undefined,
        student: assessment.student ? Number(assessment.student) : undefined,
        amount: parseFloat(assessment.amount).toFixed(2),
        due_date: assessment.due_date,
        status: assessment.status,
        description: assessment.description || '',
      }
      if (isNew) await api.post('/fee-assessments/', payload)
      else await api.patch(`/fee-assessments/${id}/`, payload)
      navigate('/admin/fees?tab=assessments')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save assessment.')
    } finally { setSaving(false) }
  }

  const handleArchive = async () => {
    if (!window.confirm('Archive this assessment?')) return
    try {
      await api.patch(`/fee-assessments/${id}/`, { status: 'archived' })
      navigate('/admin/fees?tab=assessments')
    } catch (err) { alert(err instanceof ApiError ? err.message : 'Could not archive.') }
  }

  if (loading) return <LoadingSpinner size="lg" />
  if (error) return <ErrorMessage message={error} onRetry={load} />

  // Filter sections based on school_year and grade_level
  const filteredSections = sections.filter(s =>
    s.school_year == assessment.school_year &&
    (!assessment.grade_level || s.grade_level == assessment.grade_level)
  )

  return (
    <div className="page">
      <PageHeader title={isNew ? 'New Fee Assessment' : 'Assessment'} subtitle={isNew ? undefined : `${assessment.category_code || ''} ₱${assessment.amount}`} />

      <form onSubmit={handleSubmit} className="form-card">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="category">Category <span className="required">*</span></label>
            <select id="category" value={assessment.category} onChange={e => handleChange('category', e.target.value)} required>
              <option value="">Select category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="school_year">School Year <span className="required">*</span></label>
            <select id="school_year" value={assessment.school_year} onChange={e => handleChange('school_year', e.target.value)} required>
              <option value="">Select school year</option>
              {schoolYears.map(sy => <option key={sy.id} value={sy.id}>{sy.label}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="grade_level">Grade Level</label>
            <select id="grade_level" value={assessment.grade_level} onChange={e => handleChange('grade_level', e.target.value)}>
              <option value="">— School-wide —</option>
              {gradeLevels.map(gl => <option key={gl.id} value={gl.id}>{gl.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="section">Section (Optional)</label>
            <select id="section" value={assessment.section} onChange={e => handleChange('section', e.target.value)}>
              <option value="">— All sections in grade —</option>
              {filteredSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="student">Specific Student (Optional)</label>
            <select id="student" value={assessment.student} onChange={e => handleChange('student', e.target.value)}>
              <option value="">— No specific student —</option>
              {students.map(st => <option key={st.id} value={st.id}>{st.user.full_name} ({st.section_name})</option>)}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="amount">Amount (PHP) <span className="required">*</span></label>
            <input id="amount" type="number" step="0.01" min="0"
              value={assessment.amount} onChange={e => handleChange('amount', e.target.value)}
              placeholder="e.g. 5000.00" required />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="due_date">Due Date <span className="required">*</span></label>
            <input id="due_date" type="date" value={assessment.due_date}
              onChange={e => handleChange('due_date', e.target.value)} required />
          </div>

          <div className="form-group">
            <label htmlFor="status">Status</label>
            <select id="status" value={assessment.status} onChange={e => handleChange('status', e.target.value)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea id="description" rows={4} value={assessment.description}
            onChange={e => handleChange('description', e.target.value)}
            placeholder="Optional description" />
        </div>

        {!isNew && (
          <div className="form-actions">
            <Button type="submit" variant="primary" loading={saving}>Save Changes</Button>
            {assessment.status === 'published' && (
              <Button type="button" variant="secondary" onClick={handleArchive}>Archive</Button>
            )}
          </div>
        )}

        {isNew && (
          <div className="form-actions">
            <Button type="submit" variant="primary" loading={saving}>Create Assessment</Button>
          </div>
        )}
      </form>
    </div>
  )
}