import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
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

/** Friendly empty state instead of a crash when the user may not look. */
function PermissionDenied() {
  return (
    <EmptyState
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

  const rows = list.data || []
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
            onClick={list.reload}
            disabled={list.loading}
          >
            <Icon name="refresh" size={14} />
            Refresh
          </button>
        }
      />

      {counts && (
        <div className="enr-pills" role="group" aria-label="Quick status filters">
          {QUICK_FILTERS.map((pill) => (
            <button
              key={pill.key}
              type="button"
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
              >
                <option value="">All grade levels</option>
                {(gradeLevels.data || []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="appq-year">School year</label>
              <select
                id="appq-year"
                className="select"
                value={list.filters.school_year || ''}
                onChange={(e) => updateFilter('school_year', e.target.value)}
                disabled={list.loading && !list.data}
              >
                <option value="">All school years</option>
                {(schoolYears.data || []).map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                  </option>
                ))}
              </select>
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
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const status = applicationStatus(row.status)
                    return (
                      <tr
                        key={row.id}
                        onClick={() => openDetail(row.id)}
                        style={{ cursor: 'pointer' }}
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
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {list.totalPages > 1 && (
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
                    <label htmlFor="appq-page-size" className="sr-only">
                      Rows per page
                    </label>
                    <select
                      id="appq-page-size"
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
            )}
          </>
        )}
      </section>

    </div>
  )
}
