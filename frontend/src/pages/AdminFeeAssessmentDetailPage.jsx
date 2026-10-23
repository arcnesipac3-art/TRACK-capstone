import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../services/api'
import PageHeader from '../components/PageHeader'
import ErrorMessage from '../components/ErrorMessage'
import LoadingSpinner from '../components/LoadingSpinner'
import Button from '../components/Button'
import Icon from '../components/Icon'
import Card from '../components/dashboard/Card'
import { formatCurrency } from '../utils/format'

const REQUIRED = <span style={{ color: 'var(--red-700)' }}>*</span>

/**
 * Admin Fee Assessment Detail — Create/Edit
 *
 * Scope rules (mirrored from the backend model clean()):
 * - at least one of grade level, section, or specific student is required
 * - a specific-student assessment cannot also target a grade level or section
 * - a section's grade level must match the assessment's grade level
 */
export default function AdminFeeAssessmentDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  // The static `/new` route has no `:id` param, so `id` is undefined there.
  const isNew = !id || id === 'new'

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
  // Save failures and validation hints stay inline so the form (and typed
  // data) remains visible — a failed save must not replace the page.
  const [saveError, setSaveError] = useState(null)

  // Reference data
  const [categories, setCategories] = useState([])
  const [schoolYears, setSchoolYears] = useState([])
  const [gradeLevels, setGradeLevels] = useState([])
  const [sections, setSections] = useState([])
  const [students, setStudents] = useState([])

  const back = () => navigate('/admin/fees?tab=assessments')

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
  }, [id])

  // `loadRefs` only sets state after `await`; nothing synchronous reaches
  // this effect.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { loadRefs() }, [loadRefs])
  // The `/new` route never fetches; `loading` already starts false there.
  // `load` only sets state after `await`; nothing synchronous reaches it.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { if (!isNew) load() }, [load, isNew])

  const handleChange = (field, value) => setAssessment(prev => ({ ...prev, [field]: value }))

  // Choosing a specific student clears grade/section — the backend rejects
  // individual assessments that also target a grade or section.
  const handleStudentChange = (value) => {
    setAssessment(prev => ({
      ...prev,
      student: value,
      grade_level: value ? '' : prev.grade_level,
      section: value ? '' : prev.section,
    }))
  }

  // Choosing a section auto-fills its grade level so the two always match.
  const handleSectionChange = (value) => {
    const section = sections.find(s => s.id == value)
    setAssessment(prev => ({
      ...prev,
      section: value,
      grade_level: section ? section.grade_level : prev.grade_level,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!assessment.category || !assessment.school_year || !assessment.due_date) {
      setSaveError('Category, school year, and due date are required.')
      return
    }
    const amountValue = parseFloat(assessment.amount)
    if (Number.isNaN(amountValue) || amountValue <= 0) {
      setSaveError('Amount must be a positive number.')
      return
    }
    if (!assessment.grade_level && !assessment.section && !assessment.student) {
      setSaveError('Select a scope: grade level, section, or specific student.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = {
        category: Number(assessment.category),
        school_year: Number(assessment.school_year),
        grade_level: assessment.grade_level ? Number(assessment.grade_level) : undefined,
        section: assessment.section ? Number(assessment.section) : undefined,
        student: assessment.student ? Number(assessment.student) : undefined,
        amount: amountValue.toFixed(2),
        due_date: assessment.due_date,
        status: assessment.status,
        description: assessment.description || '',
      }
      if (isNew) await api.post('/fee-assessments/', payload)
      else await api.patch(`/fee-assessments/${id}/`, payload)
      back()
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save assessment.')
    } finally { setSaving(false) }
  }

  const handleArchive = async () => {
    if (!window.confirm('Archive this assessment? It will no longer be visible to students and parents.')) return
    try {
      await api.patch(`/fee-assessments/${id}/`, { status: 'archived' })
      back()
    } catch (err) { alert(err instanceof ApiError ? err.message : 'Could not archive.') }
  }

  const backButton = (
    <Button variant="ghost" onClick={back}>
      <Icon name="arrowLeft" size={16} /> Back to Fees
    </Button>
  )

  if (loading) return <LoadingSpinner block size="lg" label="Loading assessment…" />
  if (error) {
    return (
      <div className="stack stack-md">
        <PageHeader title="Fee Assessment" actions={backButton} />
        <ErrorMessage error={error} title="Could not load assessment" onRetry={load} />
      </div>
    )
  }

  // Filter sections based on school_year and grade_level
  const filteredSections = sections.filter(s =>
    s.school_year == assessment.school_year &&
    (!assessment.grade_level || s.grade_level == assessment.grade_level)
  )

  return (
    <div className="stack stack-md">
      <PageHeader
        title={isNew ? 'New Fee Assessment' : 'Fee Assessment'}
        subtitle={
          isNew
            ? 'Assign a fee to a grade level, section, or specific student'
            : `${assessment.category_code || ''} · ${formatCurrency(assessment.amount)}`
        }
        actions={backButton}
      />

      <Card title="Assessment Details">
        <form onSubmit={handleSubmit} className="stack stack-sm">
          {saveError && <ErrorMessage error={saveError} compact />}

          <div className="row row-wrap" style={{ gap: 12 }}>
            <div className="field grow" style={{ minWidth: '220px' }}>
              <label htmlFor="category">Category {REQUIRED}</label>
              <select
                id="category"
                className="select"
                value={assessment.category}
                onChange={e => handleChange('category', e.target.value)}
                required
              >
                <option value="">Select category</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                ))}
              </select>
            </div>

            <div className="field grow" style={{ minWidth: '220px' }}>
              <label htmlFor="school_year">School Year {REQUIRED}</label>
              <select
                id="school_year"
                className="select"
                value={assessment.school_year}
                onChange={e => handleChange('school_year', e.target.value)}
                required
              >
                <option value="">Select school year</option>
                {schoolYears.map(sy => (
                  <option key={sy.id} value={sy.id}>{sy.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Scope {REQUIRED}</label>
            <div className="row row-wrap" style={{ gap: 12 }}>
              <div className="field grow" style={{ minWidth: '180px' }}>
                <label htmlFor="grade_level" style={{ fontSize: '0.82rem' }}>Grade Level</label>
                <select
                  id="grade_level"
                  className="select"
                  value={assessment.grade_level}
                  onChange={e => handleChange('grade_level', e.target.value)}
                  disabled={!!assessment.student}
                >
                  <option value="">— None —</option>
                  {gradeLevels.map(gl => (
                    <option key={gl.id} value={gl.id}>{gl.name}</option>
                  ))}
                </select>
              </div>

              <div className="field grow" style={{ minWidth: '180px' }}>
                <label htmlFor="section" style={{ fontSize: '0.82rem' }}>Section</label>
                <select
                  id="section"
                  className="select"
                  value={assessment.section}
                  onChange={e => handleSectionChange(e.target.value)}
                  disabled={!!assessment.student}
                >
                  <option value="">— All sections in grade —</option>
                  {filteredSections.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="field grow" style={{ minWidth: '180px' }}>
                <label htmlFor="student" style={{ fontSize: '0.82rem' }}>Specific Student</label>
                <select
                  id="student"
                  className="select"
                  value={assessment.student}
                  onChange={e => handleStudentChange(e.target.value)}
                >
                  <option value="">— No specific student —</option>
                  {students.map(st => (
                    <option key={st.id} value={st.id}>
                      {st.user?.full_name || st.full_name || `Student #${st.id}`} ({st.section_name})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <span className="hint">
              Pick at least one. A specific student replaces the grade/section scope.
            </span>
          </div>

          <div className="row row-wrap" style={{ gap: 12 }}>
            <div className="field" style={{ minWidth: '180px' }}>
              <label htmlFor="amount">Amount (PHP) {REQUIRED}</label>
              <input
                id="amount"
                className="input"
                type="number"
                step="0.01"
                min="0.01"
                value={assessment.amount}
                onChange={e => handleChange('amount', e.target.value)}
                placeholder="e.g. 5000.00"
                required
              />
            </div>

            <div className="field" style={{ minWidth: '180px' }}>
              <label htmlFor="due_date">Due Date {REQUIRED}</label>
              <input
                id="due_date"
                className="input"
                type="date"
                value={assessment.due_date}
                onChange={e => handleChange('due_date', e.target.value)}
                required
              />
            </div>

            <div className="field" style={{ minWidth: '180px' }}>
              <label htmlFor="status">Status</label>
              <select
                id="status"
                className="select"
                value={assessment.status}
                onChange={e => handleChange('status', e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
              <span className="hint">Published fees are visible to students and parents.</span>
            </div>
          </div>

          <div className="field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              className="textarea"
              rows={4}
              value={assessment.description}
              onChange={e => handleChange('description', e.target.value)}
              placeholder="Optional description"
            />
          </div>

          <div className="row row-wrap">
            {!isNew && assessment.status === 'published' && (
              <Button type="button" variant="secondary" onClick={handleArchive}>
                <Icon name="inbox" size={14} /> Archive
              </Button>
            )}
            <span className="grow" />
            <Button type="button" variant="secondary" onClick={back} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {isNew ? 'Create Assessment' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
