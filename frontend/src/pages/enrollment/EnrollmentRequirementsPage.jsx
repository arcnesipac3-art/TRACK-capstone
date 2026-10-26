import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import TableSkeleton from '../../components/loading/TableSkeleton'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import useFetch from '../../hooks/useFetch'
import api from '../../services/api'
import { ENROLLMENT_TYPES } from '../../utils/enrollment'
import RequirementFormModal from './RequirementFormModal'
import './RegistrarEnrollment.css'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const SEARCH_DEBOUNCE = 300

/**
 * Server-side pagination with filters — the SectionsPage pattern, scoped
 * to the document-requirement endpoint.
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
 * Document requirement configuration: which evidence each period asks of
 * which applicants, with activation toggles and ordering.
 */
export default function EnrollmentRequirementsPage() {
  const { can } = useAuth()
  const canManage = can('enrollment.manage')

  const list = usePaginatedList('/enrollment/requirements/')
  const periods = useFetch('/enrollment/periods/', { list: true })
  const gradeLevels = useFetch('/grade-levels/', { list: true })

  const [formModal, setFormModal] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [alert, setAlert] = useState(null)

  const rows = list.data || []
  const denied = list.error?.status === 403
  const hasFilters = Object.values(list.filters).some(
    (v) => v !== undefined && v !== ''
  )

  function updateFilter(key, value) {
    list.setFilters((prev) => ({ ...prev, [key]: value || undefined }))
  }

  function clearFilters() {
    list.setFilters({})
  }

  async function toggleActive(row) {
    if (busyId) return
    setBusyId(row.id)
    setAlert(null)
    try {
      await api.patch(`/enrollment/requirements/${row.id}/`, {
        is_active: !row.is_active,
      })
      setAlert({
        kind: 'success',
        text: row.is_active
          ? `Deactivated — ${row.name}.`
          : `Activated — ${row.name}.`,
      })
      list.reload()
    } catch (err) {
      setAlert({ kind: 'error', text: err.message })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Enrollment Requirements"
        subtitle="The documents each enrollment period asks applicants to submit."
        actions={
          canManage && (
            <button
              type="button"
              className="btn btn-primary btn-sm no-print"
              onClick={() => {
                setAlert(null)
                setFormModal({ mode: 'new' })
              }}
            >
              <Icon name="plus" size={15} />
              New requirement
            </button>
          )
        }
      />

      {alert && (
        <div
          className={`alert ${alert.kind === 'error' ? 'alert-error' : 'alert-success'}`}
          role="alert"
        >
          <Icon name={alert.kind === 'error' ? 'info' : 'checkCircle'} size={17} />
          <span className="grow">{alert.text}</span>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => setAlert(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <section className="card">
        <div className="card-body">
          <div className="enr-filters">
            <div className="field">
              <label htmlFor="req-period">Period</label>
              <select
                id="req-period"
                className="select"
                value={list.filters.period || ''}
                onChange={(e) => updateFilter('period', e.target.value)}
                disabled={list.loading && !list.data}
              >
                <option value="">All periods</option>
                {(periods.data || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.school_year_label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="req-grade">Grade level</label>
              <select
                id="req-grade"
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
              <label htmlFor="req-type">Enrollment type</label>
              <select
                id="req-type"
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
              <label htmlFor="req-active">Active</label>
              <select
                id="req-active"
                className="select"
                value={list.filters.active || ''}
                onChange={(e) => updateFilter('active', e.target.value)}
                disabled={list.loading && !list.data}
              >
                <option value="">All requirements</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
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
              'Requirement',
              'Period',
              'Grade level',
              'Type',
              'Required',
              'Verification',
              'Active',
              'Position',
              'Actions',
            ]}
            rows={6}
            label="Loading requirements…"
          />
        )}

        {!list.loading && denied && (
          <EmptyState
            icon="shield"
            title="You don't have permission"
            message="This screen needs the enrollment.manage permission. Ask an administrator to grant it to your account."
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
              icon="clipboard"
              title={hasFilters ? 'No matching requirements' : 'No requirements yet'}
              message={
                hasFilters
                  ? 'Clear the filters to see more.'
                  : 'Add the first document requirement so applicants know what to submit.'
              }
              action={
                canManage && !hasFilters && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setFormModal({ mode: 'new' })}
                  >
                    <Icon name="plus" size={15} />
                    New requirement
                  </button>
                )
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
                    <th scope="col">Requirement</th>
                    <th scope="col">Period</th>
                    <th scope="col">Grade level</th>
                    <th scope="col">Type</th>
                    <th scope="col">Required</th>
                    <th scope="col">Verification</th>
                    <th scope="col">Active</th>
                    <th scope="col">Position</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Requirement" className="cell-main">
                        {row.name}
                        {row.description && (
                          <span className="subtle" style={{ display: 'block' }}>
                            {row.description}
                          </span>
                        )}
                      </td>
                      <td data-label="Period">{row.period_label || '—'}</td>
                      <td data-label="Grade level">
                        {row.grade_level_name || (
                          <span className="subtle">All grades</span>
                        )}
                      </td>
                      <td data-label="Type">
                        {row.enrollment_type ? (
                          ENROLLMENT_TYPES[row.enrollment_type] ||
                          row.enrollment_type
                        ) : (
                          <span className="subtle">All types</span>
                        )}
                      </td>
                      <td data-label="Required">
                        <span
                          className={`badge ${row.is_required ? 'badge-amber' : 'badge-neutral'}`}
                        >
                          {row.is_required ? 'Required' : 'Optional'}
                        </span>
                      </td>
                      <td data-label="Verification">
                        <span
                          className={`badge ${row.requires_verification ? 'badge-blue' : 'badge-neutral'}`}
                        >
                          {row.requires_verification ? 'Verification' : 'Not required'}
                        </span>
                      </td>
                      <td data-label="Active">
                        <div className="row row-wrap" style={{ gap: 6 }}>
                          <StatusBadge
                            label={row.is_active ? 'Active' : 'Inactive'}
                            tone={row.is_active ? 'green' : 'neutral'}
                          />
                          {canManage && (
                            <button
                              type="button"
                              className="btn btn-xs btn-ghost"
                              aria-label={`${row.is_active ? 'Deactivate' : 'Activate'} ${row.name}`}
                              disabled={busyId === row.id}
                              onClick={() => toggleActive(row)}
                            >
                              {busyId === row.id ? (
                                <Icon name="refresh" size={12} />
                              ) : null}
                              {row.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td data-label="Position">{row.position}</td>
                      <td data-label="Actions" className="text-right">
                        {canManage && (
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              aria-label={`Edit ${row.name}`}
                              onClick={() => {
                                setAlert(null)
                                setFormModal(row)
                              }}
                            >
                              <Icon name="pencil" size={14} />
                              Edit
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
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
                    <label htmlFor="req-page-size" className="sr-only">
                      Rows per page
                    </label>
                    <select
                      id="req-page-size"
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

      <RequirementFormModal
        key={formModal ? `req-${formModal.id || 'new'}` : 'closed'}
        open={Boolean(formModal)}
        requirement={formModal?.id ? formModal : null}
        onClose={() => setFormModal(null)}
        onSaved={() => {
          list.reload()
          setAlert({ kind: 'success', text: 'Requirement saved.' })
        }}
      />
    </div>
  )
}
