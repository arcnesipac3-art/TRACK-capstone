import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import { ButtonLoader } from '../../components/loading'
import TableSkeleton from '../../components/loading/TableSkeleton'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useFetch from '../../hooks/useFetch'
import api from '../../services/api'
import {
  APPLICATION_STATUS,
  ENROLLMENT_TYPES,
  applicationStatus,
} from '../../utils/enrollment'
import { formatDateTime } from '../../utils/format'
import './RegistrarEnrollment.css'

/** Default page size options. */
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

/** Debounce delay for the search input (ms). */
const SEARCH_DEBOUNCE = 300

/** Ordering choices the staff endpoint accepts. */
const ORDER_OPTIONS = [
  { value: '-submitted_at', label: 'Newest submitted' },
  { value: 'submitted_at', label: 'Oldest submitted' },
  { value: '-created_at', label: 'Newest created' },
]

/** Quick-filter pills → status filter values. */
const QUICK_FILTERS = [
  { key: 'submitted', label: 'Submitted', status: 'submitted' },
  { key: 'under_review', label: 'Under review', status: 'under_review' },
  { key: 'awaiting_corrections', label: 'Corrections', status: 'incomplete' },
  { key: 'accepted', label: 'Accepted', status: 'accepted' },
]

/** Status filter options — every ApplicationStatus value. */
const STATUS_OPTIONS = Object.entries(APPLICATION_STATUS)

/** The two views above the list — one source of truth for the tablist,
 *  the roving tabindex and the arrow-key handling. */
const TABS = [
  { key: 'queue', label: 'Queue' },
  { key: 'trash', label: 'Trash' },
]

/** Tab/pill counts: a placeholder until the first response arrives so a
 *  loading list never reads as "0 records", and no fake zero on failure. */
function countLabel(list) {
  if (list.error && !list.data) return '—'
  if (list.data) return list.totalCount.toLocaleString()
  return list.loading ? '…' : '0'
}

/** Statuses whose application the Registrar may move to the trash — mirrors
 *  TRASHABLE_STATUSES enforced by the API (finished applications only). */
const TRASHABLE_STATUSES = ['cancelled', 'rejected', 'withdrawn']

/** Confirmation dialogs for the trash bin's destructive steps. Restore is
 *  safe and runs immediately, so it never asks. */
const TRASH_CONFIRM = {
  trash: {
    title: 'Move this application to the trash?',
    body: 'The application leaves every queue, list and report, and the applicant can no longer see it. You can restore it from the trash until you delete it for good.',
    confirmLabel: 'Move to trash',
    buttonMod: 'btn-danger',
  },
  purge: {
    title: 'Delete this application permanently?',
    body: 'The application and its uploaded documents are gone for good. This cannot be undone — restore it instead if you may need it later.',
    confirmLabel: 'Delete permanently',
    buttonMod: 'btn-danger',
  },
  empty: {
    title: 'Empty the trash?',
    body: 'Every application in the trash is permanently deleted together with its uploaded documents. This cannot be undone.',
    confirmLabel: 'Empty trash',
    buttonMod: 'btn-danger',
  },
}

/**
 * Server-side pagination with search, filters and ordering — the same
 * pattern SectionsPage uses, scoped to this queue's endpoint.
 */
function usePaginatedList(path, initialFilters = {}, initialOrdering = '') {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(initialFilters)
  const [ordering, setOrdering] = useState(initialOrdering)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [totalCount, setTotalCount] = useState(0)

  const abortRef = useRef(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE)
    return () => clearTimeout(timer)
  }, [search])

  // Reset the page when filters/search/ordering change (render-time
  // adjustment — avoids an intermediate fetch with a stale page number).
  const resetKey = JSON.stringify([debouncedSearch, filters, ordering])
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
      ...filters,
      ...(ordering && { ordering }),
    }

    try {
      const response = await api.get(path, { params, signal: controller.signal })
      setData(response.results || [])
      setTotalCount(response.count || 0)
    } catch (err) {
      if (err.name !== 'AbortError') setError(err)
    } finally {
      setLoading(false)
    }
  }, [path, page, pageSize, debouncedSearch, filters, ordering])

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
    setPage(Math.max(1, Math.min(newPage, totalPages)))
  }

  function handlePageSizeChange(newSize) {
    setPageSize(newSize)
    setPage(1)
  }

  function handleOrdering(value) {
    setOrdering(value)
    setPage(1)
  }

  return {
    data,
    loading,
    error,
    totalCount,
    page: clampedPage,
    totalPages,
    startIndex,
    endIndex,
    pageSize,
    search,
    filters,
    ordering,
    setSearch,
    setFilters,
    setPage: handlePageChange,
    setPageSize: handlePageSizeChange,
    setOrdering: handleOrdering,
    reload: fetchData,
  }
}

/**
 * Server-side pagination controls, shared by the active queue and the
 * trash bin. `idPrefix` keeps label/aria ids unique when both lists are
 * mounted on the same page.
 */
function ListPagination({ list, idPrefix }) {
  if (list.totalPages <= 1) return null
  return (
    <div className="pagination">
      <div className="pagination-info">
        {list.totalCount} records — showing {list.startIndex}–{list.endIndex}
      </div>
      <div className="pagination-controls">
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => list.setPage(list.page - 1)}
          disabled={list.page <= 1 || list.loading}
          aria-label="Previous page"
        >
          <Icon name="arrowLeft" size={14} />
        </button>
        <span className="pagination-pages" aria-live="polite">
          {Array.from({ length: Math.min(list.totalPages, 5) }, (_, i) => {
            let pageNum
            if (list.totalPages <= 5) pageNum = i + 1
            else if (list.page <= 3) pageNum = i + 1
            else if (list.page >= list.totalPages - 2)
              pageNum = list.totalPages - 4 + i
            else pageNum = list.page - 2 + i
            return (
              <button
                key={pageNum}
                type="button"
                className={`btn btn-sm ${list.page === pageNum ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => list.setPage(pageNum)}
                disabled={list.loading}
              >
                {pageNum}
              </button>
            )
          })}
        </span>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => list.setPage(list.page + 1)}
          disabled={list.page >= list.totalPages || list.loading}
          aria-label="Next page"
        >
          <Icon name="arrowRight" size={14} />
        </button>
        <div className="pagination-size">
          <label htmlFor={`${idPrefix}-page-size`} className="sr-only">
            Rows per page
          </label>
          <select
            id={`${idPrefix}-page-size`}
            className="select select-sm"
            value={list.pageSize}
            onChange={(e) => list.setPageSize(Number(e.target.value))}
            disabled={list.loading}
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
  )
}

/** Friendly empty state instead of a crash when the user may not look. */
function PermissionDenied() {
  return (
    <EmptyState
      as="h2"
      icon="shield"
      title="You don't have permission"
      message="This screen needs the enrollment.view permission. Ask an administrator to grant it to your account."
    />
  )
}

/**
 * The Registrar's application queue: server-paginated list of every
 * enrollment application with status/grade/year/type/date filters,
 * search and ordering, plus quick-filter pills from the dashboard counts.
 */
export default function RegistrarApplicationsPage() {
  const navigate = useNavigate()
  const list = usePaginatedList(
    '/enrollment/applications/',
    {},
    '-submitted_at'
  )

  const gradeLevels = useFetch('/grade-levels/', { list: true })
  const schoolYears = useFetch('/school-years/', { list: true })
  const dashboard = useFetch('/enrollment/dashboard/')

  // The Registrar's trash bin — a second paginated list over
  // /enrollment/applications/trash/ (soft-deleted rows only).
  const trashList = usePaginatedList('/enrollment/applications/trash/', {}, '')

  const [tab, setTab] = useState('queue') // 'queue' | 'trash'
  const [pending, setPending] = useState(null) // confirm dialog {kind, row}
  const [busy, setBusy] = useState(null) // kind of action in flight
  const [actionError, setActionError] = useState(null) // inside the dialog
  const [notice, setNotice] = useState(null) // {tone, text} above the table

  const rows = list.data || []
  const trashRows = trashList.data || []
  const denied = list.error?.status === 403
  const hasFilters =
    Boolean(list.search.trim()) ||
    Object.values(list.filters).some((v) => v !== undefined && v !== '')

  function updateFilter(key, value) {
    list.setFilters((prev) => ({ ...prev, [key]: value || undefined }))
  }

  function clearFilters() {
    list.setSearch('')
    list.setFilters({})
    list.setOrdering('-submitted_at')
  }

  function openDetail(id) {
    navigate(`/admin/enrollment/applications/${id}`)
  }

  /** Tabs pattern: Left/Right/Home/End move both the selection and the
   *  focus, since only the selected tab sits in the tab order. */
  function handleTabKeyDown(event, index) {
    let next = null
    if (event.key === 'ArrowLeft') {
      next = (index - 1 + TABS.length) % TABS.length
    } else if (event.key === 'ArrowRight') {
      next = (index + 1) % TABS.length
    } else if (event.key === 'Home') {
      next = 0
    } else if (event.key === 'End') {
      next = TABS.length - 1
    }
    if (next === null) return
    event.preventDefault()
    const target = TABS[next]
    setTab(target.key)
    setNotice(null)
    document.getElementById(`appq-tab-${target.key}`)?.focus()
  }

  function showNotice(tone, text) {
    setNotice({ tone, text })
  }

  /** Open the confirmation dialog for a destructive trash step. */
  function ask(kind, row) {
    setActionError(null)
    setPending({ kind, row })
  }

  /**
   * Run a trash-bin action. Restore is safe and immediate; trash, purge and
   * empty only ever fire from their confirmation dialog. Failures keep the
   * dialog open (with the server's message) so the registrar can retry.
   */
  async function runAction(kind, row) {
    setBusy(kind)
    setActionError(null)
    setNotice(null)
    try {
      if (kind === 'trash') {
        await api.post(`/enrollment/applications/${row.id}/trash/`)
        showNotice('success', `${row.reference} moved to the trash.`)
      } else if (kind === 'restore') {
        await api.post(`/enrollment/applications/${row.id}/restore/`)
        showNotice('success', `${row.reference} restored to the queue.`)
      } else if (kind === 'purge') {
        await api.delete(`/enrollment/applications/${row.id}/`)
        showNotice('success', `${row.reference} permanently deleted.`)
      } else if (kind === 'empty') {
        // Drain the bin a page at a time until the API reports it empty.
        let removed = 0
        for (let attempt = 0; attempt < 25; attempt += 1) {
          const res = await api.get('/enrollment/applications/trash/', {
            params: { page: 1, page_size: 100 },
          })
          const ids = (res.results || []).map((item) => item.id)
          if (ids.length === 0) break
          for (const id of ids) {
            await api.delete(`/enrollment/applications/${id}/`)
            removed += 1
          }
        }
        showNotice(
          'success',
          `Trash emptied — ${removed} application${removed === 1 ? '' : 's'} permanently deleted.`
        )
      }
      // Every trash action changes both lists' counts — refresh them so
      // neither tab can show a stale number.
      list.reload()
      trashList.reload()
      setPending(null)
    } catch (err) {
      const message = err?.message || 'Something went wrong. Please try again.'
      if (kind === 'restore') showNotice('error', message)
      else setActionError(message)
    } finally {
      setBusy(null)
    }
  }

  const counts = dashboard.data || null

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Enrollment Applications"
        subtitle="Every application the Registrar is reviewing, newest submissions first."
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm no-print"
            onClick={() => (tab === 'trash' ? trashList.reload() : list.reload())}
            disabled={tab === 'trash' ? trashList.loading : list.loading}
          >
            <Icon name="refresh" size={14} />
            Refresh
          </button>
        }
      />

      <div className="enr-tabs" role="tablist" aria-label="Application views">
        {TABS.map((view, index) => {
          const selected = tab === view.key
          const viewList = view.key === 'trash' ? trashList : list
          return (
            <button
              key={view.key}
              type="button"
              role="tab"
              id={`appq-tab-${view.key}`}
              aria-controls={`appq-panel-${view.key}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className={`enr-pill${selected ? ' active' : ''}`}
              onClick={() => {
                setTab(view.key)
                setNotice(null)
              }}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {view.label}
              <span className="enr-pill-count">{countLabel(viewList)}</span>
            </button>
          )
        })}
      </div>

      {notice && (
        <div
          className={`alert alert-${notice.tone === 'error' ? 'error' : 'success'}`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          <Icon
            name={notice.tone === 'error' ? 'info' : 'checkCircle'}
            size={17}
          />
          <span className="grow">{notice.text}</span>
        </div>
      )}

      {tab === 'queue' && (
        <div
          role="tabpanel"
          id="appq-panel-queue"
          aria-labelledby="appq-tab-queue"
          className="stack stack-md"
        >
          {counts && (
            <div className="enr-pills" role="group" aria-label="Quick status filters">
              {QUICK_FILTERS.map((pill) => (
                <button
                  key={pill.key}
                  type="button"
                  aria-pressed={list.filters.status === pill.status}
                  className={`enr-pill${list.filters.status === pill.status ? ' active' : ''}`}
                  onClick={() =>
                    updateFilter(
                      'status',
                      list.filters.status === pill.status ? '' : pill.status
                    )
                  }
                >
                  {pill.label}
                  <span className="enr-pill-count">
                    {Number(counts[pill.key] || 0).toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          )}

          <section className="card">
            <div className="card-body">
              <div className="enr-filters">
                <div className="field field-search">
                  <label htmlFor="appq-search">Search</label>
                  <input
                    id="appq-search"
                    type="search"
                    className="input"
                    placeholder="Reference, name or LRN…"
                    value={list.search}
                    onChange={(e) => list.setSearch(e.target.value)}
                    disabled={list.loading && !list.data}
                  />
                </div>
                <div className="field">
                  <label htmlFor="appq-status">Status</label>
                  <select
                    id="appq-status"
                    className="select"
                    value={list.filters.status || ''}
                    onChange={(e) => updateFilter('status', e.target.value)}
                    disabled={list.loading && !list.data}
                  >
                    <option value="">All statuses</option>
                    {STATUS_OPTIONS.map(([value, config]) => (
                      <option key={value} value={value}>
                        {config.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="appq-grade">Grade level</label>
                  <select
                    id="appq-grade"
                    className="select"
                    value={list.filters.grade_level || ''}
                    onChange={(e) => updateFilter('grade_level', e.target.value)}
                    disabled={list.loading && !list.data}
                    aria-invalid={gradeLevels.error ? 'true' : undefined}
                    aria-describedby={gradeLevels.error ? 'appq-grade-err' : undefined}
                  >
                    <option value="">All grade levels</option>
                    {(gradeLevels.data || []).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  {gradeLevels.error && (
                    <span className="field-error" id="appq-grade-err">
                      <Icon name="info" size={13} />
                      Grade levels could not be loaded.
                    </span>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="appq-year">School year</label>
                  <select
                    id="appq-year"
                    className="select"
                    value={list.filters.school_year || ''}
                    onChange={(e) => updateFilter('school_year', e.target.value)}
                    disabled={list.loading && !list.data}
                    aria-invalid={schoolYears.error ? 'true' : undefined}
                    aria-describedby={schoolYears.error ? 'appq-year-err' : undefined}
                  >
                    <option value="">All school years</option>
                    {(schoolYears.data || []).map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.label}
                      </option>
                    ))}
                  </select>
                  {schoolYears.error && (
                    <span className="field-error" id="appq-year-err">
                      <Icon name="info" size={13} />
                      School years could not be loaded.
                    </span>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="appq-type">Enrollment type</label>
                  <select
                    id="appq-type"
                    className="select"
                    value={list.filters.enrollment_type || ''}
                    onChange={(e) => updateFilter('enrollment_type', e.target.value)}
                    disabled={list.loading && !list.data}
                  >
                    <option value="">All types</option>
                    {Object.entries(ENROLLMENT_TYPES).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="appq-from">Submitted from</label>
                  <input
                    id="appq-from"
                    type="date"
                    className="input"
                    value={list.filters.submitted_from || ''}
                    onChange={(e) => updateFilter('submitted_from', e.target.value)}
                    disabled={list.loading && !list.data}
                  />
                </div>
                <div className="field">
                  <label htmlFor="appq-to">Submitted to</label>
                  <input
                    id="appq-to"
                    type="date"
                    className="input"
                    value={list.filters.submitted_to || ''}
                    onChange={(e) => updateFilter('submitted_to', e.target.value)}
                    disabled={list.loading && !list.data}
                  />
                </div>
                <div className="field">
                  <label htmlFor="appq-order">Order</label>
                  <select
                    id="appq-order"
                    className="select"
                    value={list.ordering}
                    onChange={(e) => list.setOrdering(e.target.value)}
                    disabled={list.loading && !list.data}
                  >
                    {ORDER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {hasFilters && (
                  <div className="filter-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={clearFilters}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="card">
            {list.loading && !list.data && (
              <TableSkeleton
                headers={[
                  'Reference',
                  'Applicant',
                  'Grade level',
                  'School year',
                  'Type',
                  'Status',
                  'Documents',
                  'Section',
                  'Submitted',
                  'Actions',
                ]}
                rows={8}
                label="Loading applications…"
              />
            )}

            {!list.loading && denied && <PermissionDenied />}

            {!list.loading && !denied && list.error && (
              <div className="card-body">
                <div className="alert alert-error" role="alert">
                  <Icon name="info" size={17} />
                  <span className="grow">{list.error.message}</span>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={list.reload}
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}

            {!list.loading && !list.error && rows.length === 0 && (
              <div className="card-body">
                <EmptyState
                  as="h2"
                  icon="inbox"
                  title={hasFilters ? 'No matching applications' : 'No applications yet'}
                  message={
                    hasFilters
                      ? 'Try a wider search or clear the filters.'
                      : 'Applications submitted by students and parents will appear here.'
                  }
                />
              </div>
            )}

            {!list.loading && !list.error && rows.length > 0 && (
              <>
                <div className="table-wrap">
                  <table className="table responsive-table">
                    <thead>
                      <tr>
                        <th scope="col">Reference</th>
                        <th scope="col">Applicant</th>
                        <th scope="col">Grade level</th>
                        <th scope="col">School year</th>
                        <th scope="col">Type</th>
                        <th scope="col">Status</th>
                        <th scope="col">Documents</th>
                        <th scope="col">Section</th>
                        <th scope="col">Submitted</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const status = applicationStatus(row.status)
                        return (
                          <tr
                            key={row.id}
                            className="clickable-row"
                            onClick={() => openDetail(row.id)}
                          >
                            <td data-label="Reference" className="cell-main">
                              <Link
                                to={`/admin/enrollment/applications/${row.id}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {row.reference}
                              </Link>
                            </td>
                            <td data-label="Applicant">{row.full_name}</td>
                            <td data-label="Grade level">{row.grade_level_name}</td>
                            <td data-label="School year">{row.school_year_label}</td>
                            <td data-label="Type">
                              {ENROLLMENT_TYPES[row.enrollment_type] ||
                                row.enrollment_type ||
                                '—'}
                            </td>
                            <td data-label="Status">
                              <StatusBadge
                                label={row.status_display || status.label}
                                tone={status.tone}
                              />
                            </td>
                            <td data-label="Documents">
                              {row.outstanding_documents > 0 ? (
                                <span className="badge badge-amber" title="Outstanding required documents">
                                  {row.outstanding_documents} outstanding
                                </span>
                              ) : (
                                <span className="subtle">—</span>
                              )}
                            </td>
                            <td data-label="Section">
                              {row.assigned_section_name || <span className="subtle">—</span>}
                            </td>
                            <td data-label="Submitted">
                              {row.submitted_at ? (
                                formatDateTime(row.submitted_at)
                              ) : (
                                <span className="subtle">Not yet</span>
                              )}
                            </td>
                            <td
                              data-label="Actions"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {TRASHABLE_STATUSES.includes(row.status) ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => ask('trash', row)}
                                  aria-label={`Move ${row.reference} to the trash`}
                                  disabled={Boolean(busy)}
                                >
                                  <Icon name="trash" size={14} />
                                  Trash
                                </button>
                              ) : (
                                <span className="subtle">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <ListPagination list={list} idPrefix="appq" />
              </>
            )}
          </section>
        </div>
      )}

      {tab === 'trash' && (
        <div
          role="tabpanel"
          id="appq-panel-trash"
          aria-labelledby="appq-tab-trash"
          className="stack stack-md"
        >
          <section className="card">
            <div className="card-body">
              <div className="enr-filters">
                <div className="field field-search">
                  <label htmlFor="trash-search">Search</label>
                  <input
                    id="trash-search"
                    type="search"
                    className="input"
                    placeholder="Reference, name or LRN…"
                    value={trashList.search}
                    onChange={(event) => trashList.setSearch(event.target.value)}
                    disabled={trashList.loading && !trashList.data}
                  />
                </div>
                <div className="filter-actions">
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => ask('empty', null)}
                    disabled={trashList.totalCount === 0 || Boolean(busy)}
                  >
                    <Icon name="trash" size={14} />
                    Empty trash
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            {trashList.loading && !trashList.data && (
              <TableSkeleton
                headers={['Reference', 'Applicant', 'Status', 'Trashed', 'Actions']}
                rows={5}
                label="Loading trash…"
              />
            )}

            {!trashList.loading && trashList.error?.status === 403 && (
              <PermissionDenied />
            )}

            {!trashList.loading &&
              trashList.error &&
              trashList.error.status !== 403 && (
                <div className="card-body">
                  <div className="alert alert-error" role="alert">
                    <Icon name="info" size={17} />
                    <span className="grow">{trashList.error.message}</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={trashList.reload}
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}

            {!trashList.loading &&
              !trashList.error &&
              trashRows.length === 0 && (
                <div className="card-body">
                  <EmptyState
                    as="h2"
                    icon="trash"
                    title="Trash is empty"
                    message="Cancelled, rejected or withdrawn applications moved here can be restored to the queue or deleted for good."
                  />
                </div>
              )}

            {!trashList.loading && !trashList.error && trashRows.length > 0 && (
              <>
                <div className="table-wrap">
                  <table className="table responsive-table">
                    <thead>
                      <tr>
                        <th scope="col">Reference</th>
                        <th scope="col">Applicant</th>
                        <th scope="col">Status</th>
                        <th scope="col">Trashed</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trashRows.map((row) => {
                        const status = applicationStatus(row.status)
                        return (
                          <tr
                            key={row.id}
                            className="clickable-row"
                            onClick={() => openDetail(row.id)}
                          >
                            <td data-label="Reference" className="cell-main">
                              <Link
                                to={`/admin/enrollment/applications/${row.id}`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                {row.reference}
                              </Link>
                            </td>
                            <td data-label="Applicant">{row.full_name}</td>
                            <td data-label="Status">
                              <StatusBadge
                                label={row.status_display || status.label}
                                tone={status.tone}
                              />
                            </td>
                            <td data-label="Trashed">
                              {row.deleted_at ? (
                                formatDateTime(row.deleted_at)
                              ) : (
                                <span className="subtle">—</span>
                              )}
                            </td>
                            <td
                              data-label="Actions"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <div className="row row-wrap gap-xs">
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => runAction('restore', row)}
                                  aria-label={`Restore ${row.reference}`}
                                  disabled={Boolean(busy)}
                                >
                                  <Icon name="undo" size={14} />
                                  Restore
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  onClick={() => ask('purge', row)}
                                  aria-label={`Delete ${row.reference} permanently`}
                                  disabled={Boolean(busy)}
                                >
                                  <Icon name="trash" size={14} />
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <ListPagination list={trashList} idPrefix="trashq" />
              </>
            )}
          </section>
        </div>
      )}

      <Modal
        open={Boolean(pending)}
        title={pending ? TRASH_CONFIRM[pending.kind].title : ''}
        onClose={() => {
          if (!busy) {
            setPending(null)
            setActionError(null)
          }
        }}
        dismissible={!busy}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setPending(null)
                setActionError(null)
              }}
              disabled={Boolean(busy)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`btn btn-sm ${pending ? TRASH_CONFIRM[pending.kind].buttonMod : 'btn-primary'}`}
              onClick={() => runAction(pending.kind, pending.row)}
              disabled={Boolean(busy)}
            >
              {busy && <ButtonLoader />}
              {busy
                ? 'Working…'
                : pending
                  ? TRASH_CONFIRM[pending.kind].confirmLabel
                  : ''}
            </button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          {pending ? TRASH_CONFIRM[pending.kind].body : ''}
        </p>
        {actionError && (
          <div
            className="alert alert-error"
            role="alert"
            style={{ marginTop: 12 }}
          >
            <Icon name="info" size={17} />
            <span className="grow">{actionError}</span>
          </div>
        )}
      </Modal>
    </div>
  )
}
