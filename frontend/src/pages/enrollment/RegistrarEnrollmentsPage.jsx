import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import TableSkeleton from '../../components/loading/TableSkeleton'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import useFetch from '../../hooks/useFetch'
import api from '../../services/api'
import { formatDateTime } from '../../utils/format'
import './RegistrarEnrollment.css'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const SEARCH_DEBOUNCE = 300

/** Enrollment row statuses (Enrollment.Status on the backend). */
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', tone: 'green' },
  { value: 'dropped', label: 'Dropped', tone: 'red' },
  { value: 'withdrawn', label: 'Withdrawn', tone: 'neutral' },
]

const STATUS_TONES = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, { label: s.label, tone: s.tone }])
)

/**
 * Server-side pagination with search and filters — the SectionsPage
 * pattern, scoped to the enrollments endpoint.
 */
function usePaginatedList(path) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({})
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

  const resetKey = JSON.stringify([debouncedSearch, filters])
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
  }, [path, page, pageSize, debouncedSearch, filters])

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
    setSearch,
    setFilters,
    setPage: (next) => setPage(Math.max(1, Math.min(next, totalPages))),
    setPageSize: (size) => {
      setPageSize(size)
      setPage(1)
    },
    reload: fetchData,
  }
}

/**
 * Confirmed enrollments register: every enrollment record per school year,
 * with grade/section/status filters and a link back to the source
 * application's review workspace.
 */
export default function RegistrarEnrollmentsPage() {
  const list = usePaginatedList('/enrollment/enrollments/')
  const gradeLevels = useFetch('/grade-levels/', { list: true })
  const schoolYears = useFetch('/school-years/', { list: true })

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
  }

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Confirmed Enrollments"
        subtitle="The permanent enrollment register created when the Registrar confirms an application."
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

      <section className="card">
        <div className="card-body">
          <div className="enr-filters">
            <div className="field field-search">
              <label htmlFor="enr-search">Search</label>
              <input
                id="enr-search"
                type="search"
                className="input"
                placeholder="Student name or LRN…"
                value={list.search}
                onChange={(e) => list.setSearch(e.target.value)}
                disabled={list.loading && !list.data}
              />
            </div>
            <div className="field">
              <label htmlFor="enr-year">School year</label>
              <select
                id="enr-year"
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
              <label htmlFor="enr-grade">Grade level</label>
              <select
                id="enr-grade"
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
              <label htmlFor="enr-status">Status</label>
              <select
                id="enr-status"
                className="select"
                value={list.filters.status || ''}
                onChange={(e) => updateFilter('status', e.target.value)}
                disabled={list.loading && !list.data}
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
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
              'Student',
              'LRN',
              'Grade level',
              'Section',
              'School year',
              'Status',
              'Application',
              'Confirmed by',
              'Confirmed at',
            ]}
            rows={8}
            label="Loading enrollments…"
          />
        )}

        {!list.loading && denied && (
          <EmptyState
            as="h2"
            icon="shield"
            title="You don't have permission"
            message="This screen needs the enrollment.view permission. Ask an administrator to grant it to your account."
          />
        )}

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
              title={hasFilters ? 'No matching enrollments' : 'No confirmed enrollments yet'}
              message={
                hasFilters
                  ? 'Try a wider search or clear the filters.'
                  : 'Enrollments appear here once the Registrar confirms an accepted application.'
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
                    <th scope="col">Student</th>
                    <th scope="col">LRN</th>
                    <th scope="col">Grade level</th>
                    <th scope="col">Section</th>
                    <th scope="col">School year</th>
                    <th scope="col">Status</th>
                    <th scope="col">Application</th>
                    <th scope="col">Confirmed by</th>
                    <th scope="col">Confirmed at</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const tone = STATUS_TONES[row.status] || {
                      label: row.status,
                      tone: 'neutral',
                    }
                    return (
                      <tr key={row.id}>
                        <td data-label="Student" className="cell-main">
                          {row.student_name}
                        </td>
                        <td data-label="LRN">{row.student_lrn || '—'}</td>
                        <td data-label="Grade level">{row.grade_level_name}</td>
                        <td data-label="Section">
                          {row.section_display || <span className="subtle">—</span>}
                        </td>
                        <td data-label="School year">{row.school_year_label}</td>
                        <td data-label="Status">
                          <StatusBadge label={tone.label} tone={tone.tone} />
                        </td>
                        <td data-label="Application">
                          {row.application ? (
                            <Link to={`/admin/enrollment/applications/${row.application}`}>
                              {row.application_reference || `#${row.application}`}
                            </Link>
                          ) : (
                            <span className="subtle">
                              {row.application_reference || '—'}
                            </span>
                          )}
                        </td>
                        <td data-label="Confirmed by">
                          {row.confirmed_by_name || <span className="subtle">—</span>}
                        </td>
                        <td data-label="Confirmed at">
                          {row.confirmed_at ? (
                            formatDateTime(row.confirmed_at)
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
                    <label htmlFor="enr-page-size" className="sr-only">
                      Rows per page
                    </label>
                    <select
                      id="enr-page-size"
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
