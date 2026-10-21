import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../services/api'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import LoadingSpinner from '../components/LoadingSpinner'
import Button from '../components/Button'
import { formatNumber } from '../utils/format'

/**
 * Admin Fee Category Detail — Create/Edit
 */
export default function AdminFeeCategoryDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isNew = id === 'new'

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

  const load = useCallback(async () => {
    if (isNew) { setLoading(false); return }
    try {
      const data = await api.get(`/fee-categories/${id}/`)
      setCategory(data)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load category.')
    } finally { setLoading(false) }
  }, [id, isNew])

  useEffect(() => { load() }, [load])

  const handleChange = (field, value) => {
    setCategory(prev => ({ ...prev, [field]: field === 'code' ? value.toUpperCase() : value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!category.name || !category.code) { alert('Name and code are required.'); return }
    setSaving(true)
    try {
      if (isNew) await api.post('/fee-categories/', category)
      else await api.patch(`/fee-categories/${id}/`, category)
      navigate('/admin/fees?tab=categories')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save category.')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this fee category? This cannot be undone.')) return
    try {
      await api.delete(`/fee-categories/${id}/`)
      navigate('/admin/fees?tab=categories')
    } catch (err) { alert(err instanceof ApiError ? err.message : 'Could not delete category.') }
  }

  if (loading) return <LoadingSpinner size="lg" />
  if (error) return <ErrorMessage message={error} onRetry={load} />

  return (
    <div className="page">
      <PageHeader
        title={isNew ? 'New Fee Category' : category.name}
        subtitle={isNew ? undefined : category.code}
      />

      <form onSubmit={handleSubmit} className="form-card">
        <div className="form-group">
          <label htmlFor="name">Name <span className="required">*</span></label>
          <input
            id="name" type="text"
            value={category.name}
            onChange={e => handleChange('name', e.target.value)}
            placeholder="e.g. Tuition Fee"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="code">Code <span className="required">*</span></label>
          <input
            id="code" type="text"
            value={category.code}
            onChange={e => handleChange('code', e.target.value)}
            placeholder="e.g. TUITION"
            maxLength={20}
            required
          />
        </div>

        <div className="form-group">
          <label>Type <span className="required">*</span></label>
          <div className="radio-group">
            <label className="radio">
              <input type="radio" name="fee_type" value="compulsory"
                checked={category.fee_type === 'compulsory'}
                onChange={() => handleChange('fee_type', 'compulsory')} />
              <span>Compulsory</span>
            </label>
            <label className="radio">
              <input type="radio" name="fee_type" value="voluntary"
                checked={category.fee_type === 'voluntary'}
                onChange={() => handleChange('fee_type', 'voluntary')} />
              <span>Voluntary</span>
            </label>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description" rows={4}
            value={category.description}
            onChange={e => handleChange('description', e.target.value)}
            placeholder="Optional description"
          />
        </div>

        {!isNew && (
          <div className="form-group">
            <label>Status</label>
            <div className="form-check">
              <input
                type="checkbox" id="is_active"
                checked={category.is_active}
                onChange={e => handleChange('is_active', e.target.checked)} />
              <label htmlFor="is_active">Active</label>
            </div>
          </div>
        )}

        <div className="form-actions">
          {isNew ? (
            <Button type="submit" variant="primary" loading={saving}>Create Category</Button>
          ) : (
            <>
              <Button type="submit" variant="primary" loading={saving}>Save Changes</Button>
              <Button type="button" variant="danger" onClick={handleDelete}>Delete Category</Button>
            </>
          )}
        </div>
      </form>
    </div>
  )
}