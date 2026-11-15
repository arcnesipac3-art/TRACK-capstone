import { useState } from 'react'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'
import useFetch from '../../hooks/useFetch'
import api from '../../services/api'

/**
 * A learner label the school defines for itself.
 *
 * TRACK has no category field on a learner, so this is the school's own
 * vocabulary — 'Graduating', 'Irregular', 'Working student'. A clearance period
 * then targets or excludes those labels, which is why the membership is edited
 * here rather than in a period: a label is a fact about the learner, not about
 * one campaign.
 *
 * Saving writes the whole membership at once. Adding a learner pulls them into
 * every active period scoped to this label, which the school does on purpose.
 */
export default function CategoryModal({ open, category, onClose, onSaved }) {
  const isEdit = Boolean(category?.id)
  const [form, setForm] = useState(() => ({
    name: category?.name || '',
    code: category?.code || '',
    description: category?.description || '',
    is_active: category ? Boolean(category.is_active) : true,
    position: category?.position ?? '',
  }))
  const [members, setMembers] = useState(() =>
    isEdit ? [...(category.learner_ids || [])] : []
  )
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const roster = useFetch('/students/', {
    list: true,
    params: { search },
    enabled: open && isEdit && search.trim().length >= 2,
  })

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggle(id) {
    setMembers((prev) =>
      prev.includes(id) ? prev.filter((one) => one !== id) : [...prev, id]
    )
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (!form.name.trim()) {
      setError('The label needs a name.')
      return
    }
    setBusy(true)
    setError(null)
    const body = {
      name: form.name.trim(),
      code: form.code.trim(),
      description: form.description,
      is_active: form.is_active,
      position: form.position === '' ? undefined : Number(form.position),
    }
    try {
      const saved = isEdit
        ? await api.patch(`/clearance/categories/${category.id}/`, {
            ...body,
            learners: members,
          })
        : await api.post('/clearance/categories/', body)
      onSaved(saved, isEdit)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={isEdit ? `Learners labelled “${category.name}”` : 'New learner category'}
      onClose={onClose}
      dismissible={!busy}
      width={620}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={busy} loading={busy}>
            {isEdit ? 'Save label and learners' : 'Create category'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="stack stack-md">
        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="info" size={17} />
            <span className="grow">{error}</span>
          </div>
        )}

        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="clr-cc-name">Name</label>
            <input
              id="clr-cc-name"
              className="input"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Graduating"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="clr-cc-code">Code</label>
            <input
              id="clr-cc-code"
              className="input"
              value={form.code}
              onChange={(e) => set('code', e.target.value)}
              placeholder="graduating"
            />
            <span className="subtle">Lower-case, no spaces. Used by the audit log.</span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="clr-cc-description">What it means</label>
          <textarea
            id="clr-cc-description"
            className="textarea"
            rows={2}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Grade 12 learners completing the curriculum this year."
          />
        </div>

        <div className="grid grid-2">
          <label className="checkbox-row" htmlFor="clr-cc-active">
            <input
              id="clr-cc-active"
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => set('is_active', e.target.checked)}
            />
            <span>Offered when configuring a period</span>
          </label>
          <div className="field">
            <label htmlFor="clr-cc-position">Order</label>
            <input
              id="clr-cc-position"
              className="input"
              type="number"
              min="0"
              step="10"
              value={form.position}
              onChange={(e) => set('position', e.target.value)}
              placeholder="leave empty to append"
            />
          </div>
        </div>

        {isEdit && (
          <div className="stack stack-xs">
            <span className="field-legend">Learners carrying this label</span>
            <p className="subtle">
              {members.length} selected ({category.learner_count ?? members.length} on
              record). A new period scoped to this label opens a clearance for every one
              of them; adding a learner while a period is running pulls them into it.
            </p>

            <div className="field">
              <label htmlFor="clr-cc-search">Find a learner</label>
              <input
                id="clr-cc-search"
                className="input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or LRN — at least two letters"
              />
            </div>

            {roster.loading && (
              <p className="subtle">Searching the directory…</p>
            )}

            {!roster.loading && search.trim().length >= 2 && (roster.data || []).length === 0 && (
              <EmptyState
                icon="search"
                title="No learner found"
                message="The school directory has nobody by that name or LRN."
              />
            )}

            {(roster.data || []).length > 0 && (
              <div className="check-scroll">
                {roster.data.map((learner) => {
                  const name = learner.user?.full_name || learner.user?.username
                  return (
                    <label className="checkbox-row" key={learner.id}>
                      <input
                        type="checkbox"
                        checked={members.includes(learner.id)}
                        onChange={() => toggle(learner.id)}
                      />
                      <span>
                        {name}
                        <span className="subtle block">
                          {[learner.lrn, learner.section_name]
                            .filter(Boolean)
                            .join(' · ') || 'No LRN or section'}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            )}

            {search.trim().length < 2 && (
              <p className="subtle">
                Nothing is listed until you search, so this dialog never holds the whole
                school. The checkboxes show who carries the label now.
              </p>
            )}
          </div>
        )}

        {!isEdit && (
          <p className="subtle">
            A category with no learners covers nobody: mark the learners on it after
            creating it, then scope a period to it.
          </p>
        )}
      </form>
    </Modal>
  )
}
