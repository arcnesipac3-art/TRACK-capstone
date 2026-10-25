import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../services/api'
import PageHeader from '../components/PageHeader'
import ErrorMessage from '../components/ErrorMessage'
import LoadingSpinner from '../components/LoadingSpinner'
import Button from '../components/Button'
import Icon from '../components/Icon'
import Card from '../components/dashboard/Card'

const REQUIRED = <span style={{ color: 'var(--red-700)' }}>*</span>

/**
 * Admin Fee Category Detail — Create/Edit
 */
export default function AdminFeeCategoryDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  // The static `/new` route has no `:id` param, so `id` is undefined there.
  const isNew = !id || id === 'new'

  const [category, setCategory] = useState({
    name: '',
    code: '',
    fee_type: 'compulsory',
    description: '',
    is_active: true,
  })
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  // Save failures stay inline so the form (and typed data) remains visible.
  const [saveError, setSaveError] = useState(null)

  const back = () => navigate('/admin/fees?tab=categories')

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/fee-categories/${id}/`)
      setCategory(data)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load category.')
    } finally { setLoading(false) }
  }, [id])

  // The `/new` route never fetches; `loading` already starts false there.
  // `load` writes state only after its request resolves; queueMicrotask keeps
  // the kickoff off the effect's synchronous pass.
  useEffect(() => { if (!isNew) queueMicrotask(load) }, [load, isNew])

  const handleChange = (field, value) => {
    setCategory(prev => ({ ...prev, [field]: field === 'code' ? value.toUpperCase() : value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    try {
      if (isNew) await api.post('/fee-categories/', category)
      else await api.patch(`/fee-categories/${id}/`, category)
      back()
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save category.')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this fee category? This cannot be undone.')) return
    try {
      await api.delete(`/fee-categories/${id}/`)
      back()
    } catch (err) { alert(err instanceof ApiError ? err.message : 'Could not delete category.') }
  }

  const backButton = (
    <Button variant="ghost" onClick={back}>
      <Icon name="arrowLeft" size={16} /> Back to Fees
    </Button>
  )

  if (loading) return <LoadingSpinner block size="lg" label="Loading category…" />
  if (error) {
    return (
      <div className="stack stack-md">
        <PageHeader title="Fee Category" actions={backButton} />
        <ErrorMessage error={error} title="Could not load category" onRetry={load} />
      </div>
    )
  }

  return (
    <div className="stack stack-md">
      <PageHeader
        title={isNew ? 'New Fee Category' : category.name}
        subtitle={isNew ? 'Compulsory or voluntary school fee' : `Code: ${category.code}`}
        actions={backButton}
      />

      <Card title="Category Details">
        <form onSubmit={handleSubmit} className="stack stack-sm">
          {saveError && <ErrorMessage error={saveError} compact />}

          <div className="row row-wrap" style={{ gap: 12 }}>
            <div className="field grow" style={{ minWidth: '220px' }}>
              <label htmlFor="name">Name {REQUIRED}</label>
              <input
                id="name"
                className="input"
                type="text"
                value={category.name}
                onChange={e => handleChange('name', e.target.value)}
                placeholder="e.g. Tuition Fee"
                required
                maxLength={120}
              />
            </div>
            <div className="field" style={{ minWidth: '160px' }}>
              <label htmlFor="code">Code {REQUIRED}</label>
              <input
                id="code"
                className="input"
                type="text"
                value={category.code}
                onChange={e => handleChange('code', e.target.value)}
                placeholder="e.g. TUITION"
                maxLength={20}
                required
              />
            </div>
          </div>

          <div className="field">
            <label>Type {REQUIRED}</label>
            <div className="row row-wrap" style={{ gap: 16 }}>
              <label className="checkbox-row">
                <input
                  type="radio"
                  name="fee_type"
                  value="compulsory"
                  checked={category.fee_type === 'compulsory'}
                  onChange={() => handleChange('fee_type', 'compulsory')}
                />
                Compulsory
              </label>
              <label className="checkbox-row">
                <input
                  type="radio"
                  name="fee_type"
                  value="voluntary"
                  checked={category.fee_type === 'voluntary'}
                  onChange={() => handleChange('fee_type', 'voluntary')}
                />
                Voluntary
              </label>
            </div>
            <span className="hint">
              Voluntary fees are never required for enrollment, grades, or report cards.
            </span>
          </div>

          <div className="field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              className="textarea"
              rows={4}
              value={category.description}
              onChange={e => handleChange('description', e.target.value)}
              placeholder="Optional description"
            />
          </div>

          {!isNew && (
            <div className="field">
              <label htmlFor="is_active">Status</label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={category.is_active}
                  onChange={e => handleChange('is_active', e.target.checked)}
                />
                Active — shown to students and parents
              </label>
            </div>
          )}

          <div className="row row-wrap">
            {!isNew && (
              <Button type="button" variant="danger" onClick={handleDelete}>
                <Icon name="trash" size={14} /> Delete
              </Button>
            )}
            <span className="grow" />
            <Button type="button" variant="secondary" onClick={back} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {isNew ? 'Create Category' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
