import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import Icon from '../components/Icon'
import LoadingSpinner from '../components/LoadingSpinner'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import { AUDIENCE_LABELS, formatDateTime, formatRelative } from '../utils/format'
import './AnnouncementsPage.css'

const AUDIENCE_OPTIONS = [
  { value: 'all', label: 'Everyone' },
  { value: 'students', label: 'Students' },
  { value: 'parents', label: 'Parents' },
  { value: 'teachers', label: 'Teachers' },
]

const SEARCH_DEBOUNCE = 300
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

/**
 * Confirmation dialog used before destructive actions.
 */
function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  danger = false,
}) {
  if (!open) return null

  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? undefined : onCancel}
      dismissible={!busy}
      width={460}
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="muted" style={{ fontSize: '0.92rem' }}>
        {message}
      </p>
    </Modal>
  )
}

/**
 * Announcement form modal for create/edit.
 */
function AnnouncementFormModal({
  open,
  onClose,
  onSubmit,
  initialData = null,
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState('all')
  const [pinned, setPinned] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const formRef = useRef(null)
  const previouslyFocused = useRef(null)
  // Latest-ref so the Escape listener above never acts on a stale closure
  // (the documented pattern for listeners that read render values).
  const handleCancelRef = useRef(handleCancel)
  useEffect(() => {
    handleCancelRef.current = handleCancel
  })

  const isEdit = Boolean(initialData)

  // Load initial data when editing. Adjusting state during render (rather
  // than in an effect) shows the right values in the same render that sees
  // the new `initialData` — see react.dev/learn/you-might-not-need-an-effect.
  const [prevInitialData, setPrevInitialData] = useState(initialData)
  if (prevInitialData !== initialData) {
    setPrevInitialData(initialData)
    setTitle(initialData?.title || '')
    setBody(initialData?.body || '')
    setAudience(initialData?.audience || 'all')
    setPinned(initialData?.is_pinned || false)
    setError(null)
  }

  // Focus management and keyboard handling
  useEffect(() => {
    if (!open) return undefined

    previouslyFocused.current = document.activeElement
    const panel = formRef.current
    const firstField = panel?.querySelector(
      'input:not([type="hidden"]), select, textarea, button'
    )
    firstField?.focus()

    function onKeyDown(event) {
      if (event.key === 'Escape' && !busy) {
        event.stopPropagation()
        handleCancelRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const focusable = [
        ...panel.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ),
      ].filter((el) => el.offsetParent !== null)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused.current?.focus?.()
    }
  }, [open, busy])

  function handleCancel() {
    if (busy) return
    const hasChanges = title.trim() || body.trim() || audience !== 'all' || pinned
    if (hasChanges && !window.confirm('Discard unsaved changes?')) return
    onClose()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    if (!title.trim() || !body.trim()) {
      setError('Both a title and a message are required.')
      return
    }
    setBusy(true)
    try {
      await onSubmit({
        title: title.trim(),
        body: body.trim(),
        audience,
        is_pinned: pinned,
      })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <Modal
      ref={formRef}
      open={open}
      title={isEdit ? 'Edit announcement' : 'New announcement'}
      onClose={busy ? undefined : handleCancel}
      dismissible={!busy}
      width={560}
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={busy}
          >
            {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Publish'}
          </button>
        </>
      }
    >
      <form
        className="stack stack-sm"
        onSubmit={handleSubmit}
        aria-label={isEdit ? 'Edit announcement' : 'New announcement'}
      >
        <div className="field">
          <label htmlFor="ann-title">Title <span style={{ color: 'var(--red-700)' }}>*</span></label>
          <input
            id="ann-title"
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={busy}
            required
            maxLength={200}
            aria-invalid={error && !title.trim()}
          />
        </div>

        <div className="field">
          <label htmlFor="ann-body">Message <span style={{ color: 'var(--red-700)' }}>*</span></label>
          <textarea
            id="ann-body"
            className="textarea"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={busy}
            required
            rows={5}
            aria-invalid={error && !body.trim()}
          />
        </div>

        <div className="row row-wrap" style={{ gap: 12 }}>
          <div className="field grow" style={{ flex: 1, minWidth: '200px' }}>
            <label htmlFor="ann-audience">Audience</label>
            <select
              id="ann-audience"
              className="select"
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              disabled={busy}
            >
              {AUDIENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <label className="checkbox-row" style={{ minHeight: 42, alignSelf: 'flex-end' }}>
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
            <Icon name="info" size={15} />
            <span>{error}</span>
          </div>
        )}
      </form>
    </Modal>
  )
}

/**
 * Compact announcement card for list view.
 */
function AnnouncementCard({
  announcement,
  onView,
  onEdit,
  onPin,
  onDelete,
  canEdit,
  canDelete,
  loadingActionId,
}) {
  const { id, title, body, audience, is_pinned, author_name, published_at } = announcement
  const isLoading = loadingActionId === id

  return (
    <article className={`announcement-card${is_pinned ? ' pinned' : ''}`}>
      <div className="announcement-card-header">
        <h3 className="announcement-title">{title}</h3>
        <div className="announcement-badges">
          {is_pinned && <StatusBadge label="Pinned" tone="blue" />}
          <StatusBadge
            label={AUDIENCE_LABELS[audience] || audience}
            tone="neutral"
          />
        </div>
      </div>

      <p className="announcement-preview">{body}</p>

      <div className="announcement-meta">
        <span className="announcement-author">
          {author_name || 'School'}
        </span>
        <span className="announcement-date">
          {formatDateTime(published_at)} · {formatRelative(published_at)}
        </span>
      </div>

      <div className="announcement-actions">
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => onView(announcement)}
          disabled={isLoading}
          aria-label={`View "${title}"`}
        >
          <Icon name="search" size={14} />
          View
        </button>
        {canEdit && (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => onEdit(announcement)}
            disabled={isLoading}
            aria-label={`Edit "${title}"`}
          >
            <Icon name="pencil" size={14} />
            Edit
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => onPin(announcement)}
            disabled={isLoading}
            aria-label={is_pinned ? `Unpin "${title}"` : `Pin "${title}"`}
            title={is_pinned ? 'Unpin from top' : 'Pin to top'}
          >
            <Icon name={is_pinned ? 'shield' : 'pin'} size={14} />
            {is_pinned ? 'Unpin' : 'Pin'}
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-danger"
            onClick={() => onDelete(announcement)}
            disabled={isLoading}
            aria-label={`Delete "${title}"`}
          >
            <Icon name="trash" size={14} />
            Delete
          </button>
        )}
      </div>
    </article>
  )
}

/**
 * Announcement detail view modal.
 */
function AnnouncementDetailModal({ announcement, onClose }) {
  if (!announcement) return null

  const { title, body, audience, is_pinned, author_name, published_at } = announcement

  return (
    <Modal
      open
      title="Announcement details"
      onClose={onClose}
      width={560}
      footer={
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onClose}
        >
          Close
        </button>
      }
    >
      <div className="stack stack-md">
        <div className="stack stack-xs">
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{title}</h3>
          <div className="row row-wrap" style={{ gap: 8 }}>
            <StatusBadge
              label={AUDIENCE_LABELS[audience] || audience}
              tone="neutral"
            />
            {is_pinned && <StatusBadge label="Pinned" tone="blue" />}
          </div>
        </div>

        <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{body}</p>
        </div>

        <div className="row row-wrap" style={{ gap: 16, paddingTop: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <span>Author: {author_name || 'School'}</span>
          <span>Published: {formatDateTime(published_at)}</span>
          <span>{formatRelative(published_at)}</span>
        </div>
      </div>
    </Modal>
  )
}

function usePaginatedAnnouncements() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [audienceFilter, setAudienceFilter] = useState('')
  const [pinnedFilter, setPinnedFilter] = useState('')
  const [ordering, setOrdering] = useState('-published_at')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [totalCount, setTotalCount] = useState(0)

  const abortRef = useRef(null)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE)
    return () => clearTimeout(timer)
  }, [search])

  // Reset page when filters/search change. Adjusting state during render
  // (rather than in an effect) avoids an intermediate fetch with the stale
  // page number — see react.dev/learn/you-might-not-need-an-effect.
  const resetKey = JSON.stringify([debouncedSearch, audienceFilter, pinnedFilter, ordering])
  const [prevResetKey, setPrevResetKey] = useState(resetKey)
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey)
    setPage(1)
  }

  const fetchData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)

    const params = {
      page,
      page_size: pageSize,
      ...(debouncedSearch && { search: debouncedSearch }),
      ...(audienceFilter && { audience: audienceFilter }),
      ...(pinnedFilter && { is_pinned: pinnedFilter }),
      ...(ordering && { ordering }),
    }

    try {
      const response = await api.get('/announcements/', { params, signal: controller.signal })
      setData(response.results || [])
      setTotalCount(response.count || 0)
    } catch (err) {
      if (err.name !== 'AbortError') setError(err)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, debouncedSearch, audienceFilter, pinnedFilter, ordering])

  // The spinner still flips before the request fires — `fetchData` begins
  // with it — but queueMicrotask runs that kickoff outside the effect's
  // synchronous pass. Each call aborts its predecessor, so request ordering
  // and this cleanup's abort are unchanged.
  useEffect(() => {
    queueMicrotask(fetchData)
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [fetchData])

  const totalPages = Math.ceil(totalCount / pageSize) || 1
  const clampedPage = Math.min(page, totalPages)
  const startIndex = totalCount === 0 ? 0 : (clampedPage - 1) * pageSize + 1
  const endIndex = Math.min(clampedPage * pageSize, totalCount)

  function handlePageChange(newPage) {
    const validPage = Math.max(1, Math.min(newPage, totalPages))
    setPage(validPage)
  }

  function handlePageSizeChange(newSize) {
    setPageSize(newSize)
    setPage(1)
  }

  return {
    data,
    loading,
    error,
    totalCount,
    totalPages,
    page: clampedPage,
    pageSize,
    startIndex,
    endIndex,
    setPage: handlePageChange,
    setPageSize: handlePageSizeChange,
    setSearch,
    setAudienceFilter,
    setPinnedFilter,
    setOrdering,
    reload: fetchData,
    search,
    audienceFilter,
    pinnedFilter,
    ordering,
  }
}

export default function AnnouncementsPage() {
  const { user } = useAuth()
  const canCreate = user.role === 'admin' || user.role === 'teacher'

  const {
    data: announcements,
    loading,
    error,
    totalCount,
    totalPages,
    page,
    pageSize,
    startIndex,
    endIndex,
    setPage,
    setPageSize,
    setSearch,
    setAudienceFilter,
    setPinnedFilter,
    setOrdering,
    reload,
    search,
    audienceFilter,
    pinnedFilter,
    ordering,
  } = usePaginatedAnnouncements()

  // Modal states
  const [formOpen, setFormOpen] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] = useState(null)
  const [viewingAnnouncement, setViewingAnnouncement] = useState(null)
  const [deletingAnnouncement, setDeletingAnnouncement] = useState(null)
  const [loadingActionId, setLoadingActionId] = useState(null)

  // Handle form submission (create or update)
  const handleFormSubmit = useCallback(async (formData) => {
    if (editingAnnouncement) {
      await api.patch(`/announcements/${editingAnnouncement.id}/`, formData)
    } else {
      await api.post('/announcements/', formData)
    }
    reload()
  }, [editingAnnouncement, reload])

  // Handle pin/unpin
  const handlePin = useCallback(async (announcement) => {
    setLoadingActionId(announcement.id)
    try {
      await api.patch(`/announcements/${announcement.id}/`, {
        is_pinned: !announcement.is_pinned,
      })
      reload()
    } catch (err) {
      alert(err.message)
    } finally {
      setLoadingActionId(null)
    }
  }, [reload])

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!deletingAnnouncement) return
    setLoadingActionId(deletingAnnouncement.id)
    try {
      await api.delete(`/announcements/${deletingAnnouncement.id}/`)
      setDeletingAnnouncement(null)
      reload()
    } catch (err) {
      alert(err.message)
    } finally {
      setLoadingActionId(null)
    }
  }, [deletingAnnouncement, reload])

  // Permission checks
  const canManage = useMemo(() => {
    return user.role === 'admin' || user.role === 'teacher'
  }, [user.role])

  const getItemPermissions = useCallback((announcement) => {
    const isAuthor = announcement.author === user.id
    const isAdmin = user.role === 'admin'
    const canEdit = isAdmin || (user.role === 'teacher' && isAuthor)
    const canDelete = isAdmin || (user.role === 'teacher' && isAuthor)
    return { canEdit, canDelete }
  }, [user.id, user.role])

  const hasActiveFilters = search || audienceFilter || pinnedFilter

  return (
    <div className="announcements-page stack stack-md">
      {/* Page Header */}
      <PageHeader
        title="Announcements"
        subtitle="Create and manage school-wide and class announcements."
        actions={
          <>
            {totalCount > 0 && (
              <div className="announcements-summary" style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 12 }}>
                <span className="subtle" style={{ whiteSpace: 'nowrap' }}>
                  {totalCount} announcement{totalCount !== 1 ? 's' : ''}
                </span>
                {announcements && announcements.some((a) => a.is_pinned) && (
                  <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>
                    {announcements.filter((a) => a.is_pinned).length} pinned
                  </span>
                )}
              </div>
            )}
            {canCreate && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setEditingAnnouncement(null)
                  setFormOpen(true)
                }}
                disabled={loading}
              >
                <Icon name="plus" size={15} />
                New announcement
              </button>
            )}
          </>
        }
      />

      {/* Toolbar */}
      <section className="announcements-toolbar card card-pad">
        <div className="toolbar-row toolbar-search">
          <label htmlFor="ann-search" className="visually-hidden">Search announcements</label>
          <div className="search-wrapper">
            <Icon name="search" size={16} className="search-icon" />
            <input
              id="ann-search"
              type="search"
              className="input input-sm"
              placeholder="Search title or message…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search announcements"
            />
            {search && (
              <button
                type="button"
                className="search-clear"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="toolbar-row toolbar-filters">
          <div className="field" style={{ minWidth: '160px' }}>
            <label htmlFor="ann-audience-filter" className="visually-hidden">Filter by audience</label>
            <select
              id="ann-audience-filter"
              className="select select-sm"
              value={audienceFilter}
              onChange={(event) => setAudienceFilter(event.target.value)}
              disabled={loading}
            >
              <option value="">All audiences</option>
              {AUDIENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ minWidth: '140px' }}>
            <label htmlFor="ann-pinned-filter" className="visually-hidden">Filter by pinned status</label>
            <select
              id="ann-pinned-filter"
              className="select select-sm"
              value={pinnedFilter}
              onChange={(event) => setPinnedFilter(event.target.value)}
              disabled={loading}
            >
              <option value="">All statuses</option>
              <option value="true">Pinned</option>
              <option value="false">Not pinned</option>
            </select>
          </div>

          <div className="field" style={{ minWidth: '160px' }}>
            <label htmlFor="ann-sort" className="visually-hidden">Sort order</label>
            <select
              id="ann-sort"
              className="select select-sm"
              value={ordering}
              onChange={(event) => setOrdering(event.target.value)}
              disabled={loading}
            >
              <option value="-published_at">Newest first</option>
              <option value="published_at">Oldest first</option>
              <option value="-is_pinned,-published_at">Pinned first, then newest</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSearch('')
                setAudienceFilter('')
                setPinnedFilter('')
              }}
              aria-label="Clear all filters"
            >
              <Icon name="close" size={14} />
              Clear filters
            </button>
          )}
        </div>
      </section>

      {/* Announcements List */}
      <section className="card announcements-list-card">
        {/* Loading state */}
        {loading && announcements === null && (
          <div className="loading-slot">
            <LoadingSpinner block label="Loading announcements…" />
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="card-body">
            <ErrorMessage
              error={error}
              title="Could not load announcements"
              onRetry={reload}
            />
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && (!announcements || announcements.length === 0) && (
          <div className="card-body">
            <EmptyState
              icon="megaphone"
              title={hasActiveFilters ? 'No matching announcements' : 'No announcements yet'}
              message={
                hasActiveFilters
                  ? 'Try adjusting your search or filters.'
                  : canCreate
                  ? 'Create your first announcement to get started.'
                  : 'Published announcements will appear here.'
              }
            />
          </div>
        )}

        {/* Announcement cards */}
        {!loading && !error && announcements && announcements.length > 0 && (
          <>
            <div className="announcements-grid" role="list">
              {announcements.map((announcement) => {
                const { canEdit, canDelete } = getItemPermissions(announcement)
                return (
                  <AnnouncementCard
                    key={announcement.id}
                    announcement={announcement}
                    onView={setViewingAnnouncement}
                    onEdit={(ann) => {
                      setEditingAnnouncement(ann)
                      setFormOpen(true)
                    }}
                    onPin={handlePin}
                    onDelete={setDeletingAnnouncement}
                    canEdit={canManage && canEdit}
                    canDelete={canManage && canDelete}
                    loadingActionId={loadingActionId}
                  />
                )
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <div className="pagination-info">
                  {totalCount === 0
                    ? 'No announcements'
                    : `${startIndex}–${endIndex} of ${totalCount} announcement${totalCount !== 1 ? 's' : ''}`}
                </div>
                <div className="pagination-controls">
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => setPage(page - 1)}
                    disabled={page <= 1 || loading}
                    aria-label="Previous page"
                  >
                    <Icon name="chevronLeft" size={14} />
                  </button>
                  <span className="pagination-pages" aria-live="polite">
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let pageNum
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (page <= 3) {
                        pageNum = i + 1
                      } else if (page >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = page - 2 + i
                      }
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          className={`btn btn-sm ${page === pageNum ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setPage(pageNum)}
                          disabled={loading}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPages || loading}
                    aria-label="Next page"
                  >
                    <Icon name="chevronRight" size={14} />
                  </button>
                  <div className="pagination-size">
                    <label htmlFor="ann-page-size" className="visually-hidden">Announcements per page</label>
                    <select
                      id="ann-page-size"
                      className="select select-sm"
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      disabled={loading}
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size} per page
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Modals */}
      <AnnouncementFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditingAnnouncement(null)
        }}
        onSubmit={handleFormSubmit}
        initialData={editingAnnouncement}
      />

      <AnnouncementDetailModal
        announcement={viewingAnnouncement}
        onClose={() => setViewingAnnouncement(null)}
      />

      <ConfirmDialog
        open={!!deletingAnnouncement}
        title="Delete announcement?"
        message={`Are you sure you want to delete "${deletingAnnouncement?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeletingAnnouncement(null)}
        busy={loadingActionId === deletingAnnouncement?.id}
        danger
      />
    </div>
  )
}
