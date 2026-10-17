import { useState } from 'react'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import Icon from '../components/Icon'
import LoadingSpinner from '../components/LoadingSpinner'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import useFetch from '../hooks/useFetch'
import { formatDateTime, formatRelative } from '../utils/format'

const AUDIENCE_LABELS = {
  all: 'Everyone',
  students: 'Students',
  parents: 'Parents',
  teachers: 'Teachers',
}

function NewAnnouncementForm({ onCreated }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState('all')
  const [pinned, setPinned] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError(null)
    if (!title.trim() || !body.trim()) {
      setError('Both a title and a message are required.')
      return
    }
    setBusy(true)
    try {
      await api.post('/announcements/', {
        title: title.trim(),
        body: body.trim(),
        audience,
        is_pinned: pinned,
      })
      setTitle('')
      setBody('')
      setAudience('all')
      setPinned(false)
      setOpen(false)
      onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => setOpen(true)}
      >
        <Icon name="plus" size={15} />
        New announcement
      </button>
    )
  }

  return (
    <form
      className="card card-pad stack stack-sm"
      onSubmit={submit}
      style={{ width: '100%', maxWidth: 640, margin: '0 auto' }}
      aria-label="New announcement"
    >
      <div className="field">
        <label htmlFor="ann-title">Title</label>
        <input
          id="ann-title"
          className="input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={busy}
        />
      </div>
      <div className="field">
        <label htmlFor="ann-body">Message</label>
        <textarea
          id="ann-body"
          className="textarea"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          disabled={busy}
        />
      </div>
      <div className="row row-wrap">
        <div className="field grow">
          <label htmlFor="ann-audience">Audience</label>
          <select
            id="ann-audience"
            className="select"
            value={audience}
            onChange={(event) => setAudience(event.target.value)}
            disabled={busy}
          >
            {Object.entries(AUDIENCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <label className="checkbox-row" style={{ minHeight: 42 }}>
          <input
            type="checkbox"
            checked={pinned}
            onChange={(event) => setPinned(event.target.checked)}
            disabled={busy}
          />
          Pin to top
        </label>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="row row-end">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
          {busy ? 'Publishing…' : 'Publish'}
        </button>
      </div>
    </form>
  )
}

export default function AnnouncementsPage() {
  const { user } = useAuth()
  const [filter, setFilter] = useState('all')
  const { data, loading, error, reload } = useFetch('/announcements/', {
    list: true,
    params: { page_size: 100 },
  })

  const canCreate = user.role === 'admin' || user.role === 'teacher'
  const items = (data || []).filter(
    (item) => filter === 'all' || item.audience === filter
  )

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Announcements"
        subtitle="School and class announcements for your role."
        actions={
          <div className="field" style={{ minWidth: 170 }}>
            <label htmlFor="ann-filter" className="visually-hidden">
              Filter by audience
            </label>
            <select
              id="ann-filter"
              className="select"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">All audiences</option>
              {Object.entries(AUDIENCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {canCreate && <NewAnnouncementForm onCreated={reload} />}

      <section className="card">
        {loading && <LoadingSpinner block label="Loading announcements…" />}

        {!loading && error && (
          <div className="card-body">
            <ErrorMessage
              error={error}
              title="Could not load announcements"
              onRetry={reload}
            />
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="card-body">
            <EmptyState
              icon="megaphone"
              title="No announcements"
              message={
                filter === 'all'
                  ? 'Published announcements will be listed here.'
                  : 'Nothing published for this audience yet.'
              }
            />
          </div>
        )}

        {!loading &&
          !error &&
          items.map((item) => (
            <article className="announcement-item" key={item.id}>
              <div className="ai-head">
                <h3>{item.title}</h3>
                {item.is_pinned && <StatusBadge label="Pinned" tone="blue" />}
                <StatusBadge
                  label={AUDIENCE_LABELS[item.audience] || item.audience}
                  tone="neutral"
                />
              </div>
              <p className="ai-body">{item.body}</p>
              <p className="ai-meta">
                {formatDateTime(item.published_at)} ·{' '}
                {item.author_name || 'School'} · {formatRelative(item.published_at)}
              </p>
            </article>
          ))}
      </section>
    </div>
  )
}
