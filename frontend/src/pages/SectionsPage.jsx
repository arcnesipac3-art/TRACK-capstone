import ButtonLoader from '../components/loading/ButtonLoader'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import Card from '../components/dashboard/Card'
import StructureFormModal from '../components/admin/StructureFormModal'
import { endpointFor, nounFor, KINDS } from '../config/structure'
import api from '../services/api'
import useFetch from '../hooks/useFetch'
import { formatDate } from '../utils/format'
import './SectionsPage.css'

/**
 * Delete confirmation messages per kind.
 */
const CONFIRM = {
  section: (item) =>
    `Delete section ${item.name}?\n\nThis cannot be undone. The server will refuse if students are still enrolled or a teacher is still assigned.`,
  subject: (item) =>
    `Delete subject ${item.name}?\n\nThis cannot be undone. The server will refuse if a teacher is still assigned to it.`,
  schoolYear: (item) =>
    `Delete school year ${item.label}?\n\nThis cannot be undone, and it will also delete every section and subject in it — which removes the class assignments, requirements, submissions and attendance records tied to those sections.\n\nThe server will refuse while any section or subject still belongs to this year.${
      item.is_active
        ? '\n\nThis is the current school year. Deleting it leaves no current year until you mark another one.'
        : ''
    }`,
  gradeLevel: (item) =>
    `Delete ${item.name}?\n\nThis cannot be undone. The server will refuse while any section or subject still uses this grade level.`,
}

/** Default page size options. */
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

/** Debounce delay for search inputs (ms). */
const SEARCH_DEBOUNCE = 300

/**
 * Generic paginated data hook with search, filters, and sorting.
 */
function usePaginatedList(kind, initialFilters = {}) {
  const { endpoint } = KINDS[kind]
  const path = `/${endpoint}/`

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(initialFilters)
  const [ordering, setOrdering] = useState('')
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

  function handleSort(field) {
    setOrdering((current) => (current === field ? `-${field}` : field))
    setPage(1)
  }

  function reload() {
    fetchData()
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
    setOrdering: handleSort,
    reload,
  }
}

/** Shared Edit + Delete cell for all tables. */
function ActionsCell({ kind, item, busyId, onEdit, onDelete }) {
  const id = `${kind}-${item.id}`
  const name = item.name || item.label
  return (
    <div className="row-actions">
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        aria-label={`Edit ${name}`}
        onClick={() => onEdit(kind, item)}
      >
        <Icon name="pencil" size={14} />
        Edit
      </button>
      <button
        type="button"
        className="btn btn-sm btn-danger"
        aria-label={`Delete ${name}`}
        onClick={() => onDelete(kind, item)}
        disabled={busyId === id}
      >
        {busyId === id ? (
          <ButtonLoader />
        ) : (
          <Icon name="trash" size={14} />
        )}
        Delete
      </button>
    </div>
  )
}

/** Sortable column header. */
function SortableHeader({ label, field, currentOrdering, onSort, disabled }) {
  const isActive = currentOrdering === field || currentOrdering === `-${field}`
  const isDesc = currentOrdering === `-${field}`
  return (
    <th
      scope="col"
      className={`sortable${isActive ? ' active' : ''}${disabled ? ' disabled' : ''}`}
      onClick={disabled ? undefined : () => onSort(field)}
      style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      <span className="flex-row" style={{ gap: 4, alignItems: 'center' }}>
        {label}
        {isActive && <Icon name={isDesc ? 'chevronDown' : 'chevronUp'} size={12} />}
      </span>
    </th>
  )
}

export default function SectionsPage() {
  const [activeTab, setActiveTab] = useState('schoolYear')
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [modal, setModal] = useState(null)

  // Options for form modal (grade levels, school years, teachers)
  const gradeLevelsAll = useFetch('/grade-levels/', { list: true, params: { page_size: 1000 } })
  const schoolYearsAll = useFetch('/school-years/', { list: true, params: { page_size: 1000 } })
  const teachersAll = useFetch('/users/', { list: true, params: { role: 'teacher', page_size: 1000 } })

  const options = useMemo(
    () => ({
      gradeLevels: gradeLevelsAll.data || [],
      schoolYears: schoolYearsAll.data || [],
      teachers: teachersAll.data || [],
    }),
    [gradeLevelsAll.data, schoolYearsAll.data, teachersAll.data]
  )

  // Paginated lists for each kind
  const schoolYears = usePaginatedList('schoolYear', {})
  const gradeLevels = usePaginatedList('gradeLevel', {})
  const sections = usePaginatedList('section', {})
  const subjects = usePaginatedList('subject', {})

  const lists = useMemo(
    () => ({
      schoolYear: schoolYears,
      gradeLevel: gradeLevels,
      section: sections,
      subject: subjects,
    }),
    [schoolYears, gradeLevels, sections, subjects]
  )

  const currentList = lists[activeTab]

  // Summary counts for the active tab
  const summaryCounts = useMemo(() => {
    switch (activeTab) {
      case 'schoolYear':
        return { total: schoolYears.totalCount, label: 'School years' }
      case 'gradeLevel':
        return { total: gradeLevels.totalCount, label: 'Grade levels' }
      case 'section':
        return { total: sections.totalCount, label: 'Sections' }
      case 'subject':
        return { total: subjects.totalCount, label: 'Subjects' }
      default:
        return { total: 0, label: '' }
    }
  }, [activeTab, schoolYears.totalCount, gradeLevels.totalCount, sections.totalCount, subjects.totalCount])

  function closeModal() {
    setModal(null)
  }

  async function remove(kind, item) {
    if (!window.confirm(CONFIRM[kind](item))) return

    setBusyId(`${kind}-${item.id}`)
    setActionError(null)
    try {
      await api.delete(`/${endpointFor(kind)}/${item.id}/`)
      lists[kind]?.reload?.()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  function handleEdit(kind, item) {
    setModal({ kind, item })
  }

  function handleDelete(kind, item) {
    remove(kind, item)
  }

  // Tab filter components
  const TabFilters = useMemo(() => {
    switch (activeTab) {
      case 'schoolYear':
        return (
          <div className="tab-filters">
            <div className="field" style={{ minWidth: 200 }}>
              <label htmlFor="sy-search" className="sr-only">Search school years</label>
              <input
                id="sy-search"
                type="search"
                className="input"
                placeholder="Search school years…"
                value={schoolYears.search}
                onChange={(e) => schoolYears.setSearch(e.target.value)}
                disabled={schoolYears.loading}
              />
            </div>
            <div className="field">
              <label htmlFor="sy-status" className="sr-only">Filter by status</label>
              <select
                id="sy-status"
                className="select select-sm"
                value={schoolYears.filters.is_active || ''}
                onChange={(e) => schoolYears.setFilters({ ...schoolYears.filters, is_active: e.target.value || undefined })}
                disabled={schoolYears.loading}
              >
                <option value="">All statuses</option>
                <option value="true">Current</option>
                <option value="false">Not current</option>
              </select>
            </div>
          </div>
        )
      case 'gradeLevel':
        return (
          <div className="tab-filters">
            <div className="field" style={{ minWidth: 200 }}>
              <label htmlFor="gl-search" className="sr-only">Search grade levels</label>
              <input
                id="gl-search"
                type="search"
                className="input"
                placeholder="Search grade levels…"
                value={gradeLevels.search}
                onChange={(e) => gradeLevels.setSearch(e.target.value)}
                disabled={gradeLevels.loading}
              />
            </div>
          </div>
        )
      case 'section':
        return (
          <div className="tab-filters">
            <div className="field" style={{ minWidth: 200 }}>
              <label htmlFor="sec-search" className="sr-only">Search sections</label>
              <input
                id="sec-search"
                type="search"
                className="input"
                placeholder="Search sections…"
                value={sections.search}
                onChange={(e) => sections.setSearch(e.target.value)}
                disabled={sections.loading}
              />
            </div>
            <div className="field">
              <label htmlFor="sec-sy" className="sr-only">Filter by school year</label>
              <select
                id="sec-sy"
                className="select select-sm"
                value={sections.filters.school_year || ''}
                onChange={(e) => sections.setFilters({ ...sections.filters, school_year: e.target.value || undefined })}
                disabled={sections.loading}
              >
                <option value="">All school years</option>
                {(schoolYearsAll.data || []).map((y) => (
                  <option key={y.id} value={y.id}>{y.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sec-gl" className="sr-only">Filter by grade level</label>
              <select
                id="sec-gl"
                className="select select-sm"
                value={sections.filters.grade_level || ''}
                onChange={(e) => sections.setFilters({ ...sections.filters, grade_level: e.target.value || undefined })}
                disabled={sections.loading}
              >
                <option value="">All grade levels</option>
                {(gradeLevelsAll.data || []).map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sec-adv" className="sr-only">Filter by adviser</label>
              <select
                id="sec-adv"
                className="select select-sm"
                value={sections.filters.adviser || ''}
                onChange={(e) => sections.setFilters({ ...sections.filters, adviser: e.target.value || undefined })}
                disabled={sections.loading}
              >
                <option value="">All advisers</option>
                {(teachersAll.data || []).map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name || t.username}</option>
                ))}
              </select>
            </div>
          </div>
        )
      case 'subject':
        return (
          <div className="tab-filters">
            <div className="field" style={{ minWidth: 200 }}>
              <label htmlFor="sub-search" className="sr-only">Search subjects</label>
              <input
                id="sub-search"
                type="search"
                className="input"
                placeholder="Search subjects or codes…"
                value={subjects.search}
                onChange={(e) => subjects.setSearch(e.target.value)}
                disabled={subjects.loading}
              />
            </div>
            <div className="field">
              <label htmlFor="sub-sy" className="sr-only">Filter by school year</label>
              <select
                id="sub-sy"
                className="select select-sm"
                value={subjects.filters.school_year || ''}
                onChange={(e) => subjects.setFilters({ ...subjects.filters, school_year: e.target.value || undefined })}
                disabled={subjects.loading}
              >
                <option value="">All school years</option>
                {(schoolYearsAll.data || []).map((y) => (
                  <option key={y.id} value={y.id}>{y.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sub-gl" className="sr-only">Filter by grade level</label>
              <select
                id="sub-gl"
                className="select select-sm"
                value={subjects.filters.grade_level || ''}
                onChange={(e) => subjects.setFilters({ ...subjects.filters, grade_level: e.target.value || undefined })}
                disabled={subjects.loading}
              >
                <option value="">All grade levels</option>
                {(gradeLevelsAll.data || []).map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>
        )
      default:
        return null
    }
  }, [activeTab, schoolYears, gradeLevels, sections, subjects, schoolYearsAll.data, gradeLevelsAll.data, teachersAll.data])

  // Column definitions per tab
  const columns = useMemo(() => {
    switch (activeTab) {
      case 'schoolYear':
        return [
          { field: 'label', label: 'School year', sortable: true },
          { field: 'start_date', label: 'Start date', sortable: true },
          { field: 'end_date', label: 'End date', sortable: true },
          { field: 'is_active', label: 'Status', sortable: true },
          { field: 'section_count', label: 'Sections', sortable: false },
          { field: 'subject_count', label: 'Subjects', sortable: false },
          { field: 'actions', label: 'Actions', sortable: false },
        ]
      case 'gradeLevel':
        return [
          { field: 'name', label: 'Grade level', sortable: true },
          { field: 'order', label: 'Sort order', sortable: true },
          { field: 'section_count', label: 'Sections', sortable: false },
          { field: 'subject_count', label: 'Subjects', sortable: false },
          { field: 'actions', label: 'Actions', sortable: false },
        ]
      case 'section':
        return [
          { field: 'name', label: 'Section', sortable: true },
          { field: 'grade_level_name', label: 'Grade level', sortable: true },
          { field: 'school_year_label', label: 'School year', sortable: true },
          { field: 'adviser_name', label: 'Adviser', sortable: true },
          { field: 'student_count', label: 'Students', sortable: false },
          { field: 'actions', label: 'Actions', sortable: false },
        ]
      case 'subject':
        return [
          { field: 'name', label: 'Subject', sortable: true },
          { field: 'code', label: 'Code', sortable: true },
          { field: 'grade_level_name', label: 'Grade level', sortable: true },
          { field: 'school_year_label', label: 'School year', sortable: true },
          { field: 'assignment_count', label: 'Assignments', sortable: false },
          { field: 'actions', label: 'Actions', sortable: false },
        ]
      default:
        return []
    }
  }, [activeTab])

  return (
    <div className="stack stack-md">
      <PageHeader
        title="School Structure"
        subtitle="The school years, grade levels, sections and subjects everything else is built on."
      />

      {actionError && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={17} />
          <span className="grow">{actionError}</span>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => setActionError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Summary bar */}
      <div className="sections-summary">
        <span className="summary-count">
          {summaryCounts.total} {summaryCounts.label}
        </span>
        {currentList.totalCount > 0 && (
          <span className="summary-range">
            Showing {currentList.startIndex}–{currentList.endIndex}
          </span>
        )}
      </div>

      {/* Category tabs */}
      <div className="tabs" role="tablist" aria-label="School structure categories">
        {Object.entries(KINDS).map(([key, config]) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            className={`tab${activeTab === key ? ' active' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            {config.noun.charAt(0).toUpperCase() + config.noun.slice(1)}s
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <Card
        loading={currentList.loading && !currentList.data}
        error={currentList.error}
        onRetry={currentList.reload}
        action={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setModal({ kind: activeTab, item: null })}
            disabled={currentList.loading}
          >
            <Icon name="plus" size={15} />
            Add {nounFor(activeTab)}
          </button>
        }
        empty={
          !currentList.loading && (!currentList.data || currentList.data.length === 0) ? (
            <EmptyState
              icon={
                activeTab === 'schoolYear' ? 'calendar' :
                activeTab === 'gradeLevel' ? 'layers' :
                activeTab === 'section' ? 'layers' : 'book'
              }
              title={`No ${nounFor(activeTab)}s`}
              message={
                activeTab === 'schoolYear'
                  ? 'Add the first school year, e.g. 2026-2027.'
                : activeTab === 'gradeLevel'
                  ? 'Add the first grade level, e.g. Grade 7.'
                : activeTab === 'section'
                  ? 'Add the first section for this school year.'
                : 'Add the first subject for this school year.'
              }
            />
          ) : null
        }
      >
        {TabFilters}

        <div className="table-wrap">
          <table className="table responsive-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <SortableHeader
                    key={col.field}
                    label={col.label}
                    field={col.field}
                    currentOrdering={currentList.ordering}
                    onSort={currentList.setOrdering}
                    disabled={!col.sortable}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {(currentList.data || []).map((item) => (
                <tr key={item.id}>
                  {columns.map((col) => {
                    if (col.field === 'actions') {
                      return (
                        <td key="actions" data-label="Actions" className="text-right">
                          <ActionsCell
                            kind={activeTab}
                            item={item}
                            busyId={busyId}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                          />
                        </td>
                      )
                    }
                    if (col.field === 'is_active') {
                      return (
                        <td key="is_active" data-label="Status">
                          {item.is_active ? (
                            <StatusBadge label="Current" tone="green" />
                          ) : (
                            <StatusBadge label="Not current" tone="neutral" />
                          )}
                        </td>
                      )
                    }
                    if (col.field === 'start_date' || col.field === 'end_date') {
                      return (
                        <td key={col.field} data-label={col.label}>
                          {formatDate(item[col.field])}
                        </td>
                      )
                    }
                    return (
                      <td key={col.field} data-label={col.label} className={col.field === columns[0].field ? 'cell-main' : ''}>
                        {item[col.field] ?? (col.field === 'code' ? <span className="subtle">—</span> : null)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {currentList.totalPages > 1 && (
          <div className="pagination">
            <div className="pagination-info">
              {currentList.totalCount} records
            </div>
            <div className="pagination-controls">
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => currentList.setPage(currentList.page - 1)}
                disabled={currentList.page <= 1 || currentList.loading}
                aria-label="Previous page"
              >
                <Icon name="chevronLeft" size={14} />
              </button>
              <span className="pagination-pages" aria-live="polite">
                {Array.from({ length: Math.min(currentList.totalPages, 5) }, (_, i) => {
                  let pageNum
                  if (currentList.totalPages <= 5) {
                    pageNum = i + 1
                  } else if (currentList.page <= 3) {
                    pageNum = i + 1
                  } else if (currentList.page >= currentList.totalPages - 2) {
                    pageNum = currentList.totalPages - 4 + i
                  } else {
                    pageNum = currentList.page - 2 + i
                  }
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      className={`btn btn-sm ${currentList.page === pageNum ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => currentList.setPage(pageNum)}
                      disabled={currentList.loading}
                    >
                      {pageNum}
                    </button>
                  )
                })}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => currentList.setPage(currentList.page + 1)}
                disabled={currentList.page >= currentList.totalPages || currentList.loading}
                aria-label="Next page"
              >
                <Icon name="chevronRight" size={14} />
              </button>
              <div className="pagination-size">
                <label htmlFor="page-size" className="sr-only">Rows per page</label>
                <select
                  id="page-size"
                  className="select select-sm"
                  value={currentList.pageSize}
                  onChange={(e) => currentList.setPageSize(Number(e.target.value))}
                  disabled={currentList.loading}
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
      </Card>

      <StructureFormModal
        key={modal ? `${modal.kind}-${modal.item?.id || 'new'}` : 'closed'}
        open={Boolean(modal)}
        kind={modal?.kind || 'section'}
        item={modal?.item}
        options={options}
        onClose={closeModal}
        onSaved={() => modal && lists[modal.kind]?.reload?.()}
      />
    </div>
  )
}
