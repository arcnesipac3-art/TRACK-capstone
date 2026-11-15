import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Button from '../../components/Button'
import Card, { SummaryRows } from '../../components/dashboard/Card'
import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import { useAuth } from '../../context/AuthContext'
import useFetch from '../../hooks/useFetch'
import { API_BASE } from '../../services/api'
import { CLEARANCE_TYPES, overallStatus } from '../../utils/clearance'
import { downloadAuthorizedFile } from '../../utils/enrollment'
import { formatDate } from '../../utils/format'
import './Clearance.css'

const FILTER_KEYS = [
  'period',
  'school_year',
  'clearance_type',
  'status',
  'grade_level',
  'section',
  'department',
  'department_status',
  'obligations',
  'search',
]

/** The server caps a report at this many rows; at the cap, the screen says so. */
const REPORT_CAP = 5000

/**
 * The reportable rows, and the way out of the system.
 *
 * One query, two shapes: the screen reads the same rows the CSV is written
 * from, so what a clerk signs off on screen is what the spreadsheet contains.
 * The export is the server's own — a report that leaves the school is audited
 * as it leaves, which a browser-side CSV cannot be.
 */
export default function ClearanceReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { can } = useAuth()
  const canExport = can('clearance.export')

  const [filters, setFilters] = useState(() =>
    FILTER_KEYS.reduce((acc, key) => {
      acc[key] = searchParams.get(key) || ''
      return acc
    }, {})
  )
  const [typed, setTyped] = useState(filters.search)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)

  const options = useFetch('/clearance/options/')
  const periods = useFetch('/clearance/periods/', { list: true })
  const sections = useFetch('/sections/', { list: true })

  const report = useFetch('/clearance/reports/', { params: filters })
  const rows = useMemo(() => report.data?.rows || [], [report.data])

  // The report carries each learner's status as the words Django stores with
  // the choice, so the badge tone is looked up through the server's own list
  // rather than a guessed translation.
  const statusByLabel = useMemo(() => {
    const map = new Map()
    for (const choice of options.data?.overall_statuses || []) {
      map.set(choice.label, choice.value)
    }
    return map
  }, [options.data])

  const mix = useMemo(() => {
    const counted = {}
    for (const row of rows) {
      counted[row.status] = (counted[row.status] || 0) + 1
    }
    return counted
  }, [rows])

  function narrow(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function clearFilters() {
    setFilters(FILTER_KEYS.reduce((acc, key) => ({ ...acc, [key]: '' }), {}))
    setTyped('')
  }

  const active = FILTER_KEYS.some((key) => filters[key])
  const denied = report.error?.status === 403

  function csvQuery() {
    const query = new URLSearchParams()
    for (const key of FILTER_KEYS) {
      if (filters[key]) query.set(key, filters[key])
    }
    // `?format=` belongs to the API's content negotiation, so the export
    // switch is its own parameter.
    query.set('export', 'csv')
    return query.toString()
  }

  async function exportCsv() {
    setExporting(true)
    setExportError(null)
    try {
      await downloadAuthorizedFile(
        API_BASE,
        `clearance/reports/?${csvQuery()}`,
        'clearance-report.csv'
      )
    } catch (err) {
      setExportError(err.message || 'The report could not be exported.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Clearance Reports"
        subtitle="Every learner row the school can answer with — filtered here, exported from the same query."
        actions={
          canExport && (
            <Button
              variant="secondary"
              size="sm"
              loading={exporting}
              loadingLabel="Exporting…"
              disabled={rows.length === 0}
              onClick={exportCsv}
            >
              <Icon name="download" size={14} />
              Export CSV
            </Button>
          )
        }
      />

      {exportError && (
        <div className="alert alert-error" role="alert">
          {exportError}
        </div>
      )}

      {denied ? (
        <Card>
          <EmptyState
            as="h2"
            icon="shield"
            title="You don't have permission"
            message="Clearance reports need the clearance.view permission."
          />
        </Card>
      ) : (
        <>
          <div className="filter-bar">
            <div className="field">
              <label htmlFor="clr-rf-period">Period</label>
              <select
                id="clr-rf-period"
                className="select"
                value={filters.period}
                onChange={(e) => narrow('period', e.target.value)}
              >
                <option value="">Every period</option>
                {(periods.data || []).map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="clr-rf-year">School year</label>
              <select
                id="clr-rf-year"
                className="select"
                value={filters.school_year}
                onChange={(e) => narrow('school_year', e.target.value)}
              >
                <option value="">Any year</option>
                {(options.data?.school_years || []).map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="clr-rf-type">Clearance type</label>
              <select
                id="clr-rf-type"
                className="select"
                value={filters.clearance_type}
                onChange={(e) => narrow('clearance_type', e.target.value)}
              >
                <option value="">Any type</option>
                {(options.data?.clearance_types || []).map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {CLEARANCE_TYPES[choice.value] || choice.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="clr-rf-status">Overall status</label>
              <select
                id="clr-rf-status"
                className="select"
                value={filters.status}
                onChange={(e) => narrow('status', e.target.value)}
              >
                <option value="">Any status</option>
                {(options.data?.overall_statuses || []).map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="clr-rf-grade">Grade level</label>
              <select
                id="clr-rf-grade"
                className="select"
                value={filters.grade_level}
                onChange={(e) => narrow('grade_level', e.target.value)}
              >
                <option value="">All grade levels</option>
                {(options.data?.grade_levels || []).map((grade) => (
                  <option key={grade.id} value={grade.id}>
                    {grade.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="clr-rf-section">Section</label>
              <select
                id="clr-rf-section"
                className="select"
                value={filters.section}
                onChange={(e) => narrow('section', e.target.value)}
              >
                <option value="">All sections</option>
                {(sections.data || []).map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="clr-rf-department">Department</label>
              <select
                id="clr-rf-department"
                className="select"
                value={filters.department}
                onChange={(e) => narrow('department', e.target.value)}
              >
                <option value="">Any office</option>
                {(options.data?.departments || []).map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="clr-rf-dept-status">Department status</label>
              <select
                id="clr-rf-dept-status"
                className="select"
                value={filters.department_status}
                onChange={(e) => narrow('department_status', e.target.value)}
              >
                <option value="">Any sign-off</option>
                {(options.data?.department_statuses || []).map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="clr-rf-obligations">Obligations</label>
              <select
                id="clr-rf-obligations"
                className="select"
                value={filters.obligations}
                onChange={(e) => narrow('obligations', e.target.value)}
              >
                <option value="">Anyone</option>
                <option value="open">With something outstanding</option>
              </select>
            </div>

            <form
              className="field grow"
              onSubmit={(event) => {
                event.preventDefault()
                narrow('search', typed.trim())
                setTyped(typed.trim())
                setSearchParams(
                  Object.fromEntries(
                    Object.entries({ ...filters, search: typed.trim() }).filter(
                      ([, value]) => value
                    )
                  ),
                  { replace: true }
                )
              }}
            >
              <label htmlFor="clr-rf-search">Search</label>
              <div className="row row-wrap">
                <input
                  id="clr-rf-search"
                  className="input"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="Name, LRN or clearance reference"
                />
                <Button variant="secondary" size="sm" type="submit">
                  <Icon name="search" size={14} />
                  Search
                </Button>
                {active && (
                  <Button variant="ghost" size="sm" type="button" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </div>
            </form>
          </div>

          <section className="clr-setup">
            <div className="stack stack-md">
              <Card
                title="Report rows"
                action={<span className="subtle">{report.data?.total ?? 0} learner(s)</span>}
                loading={report.loading && !report.data}
                error={report.error}
                onRetry={report.reload}
                flush={rows.length > 0}
              >
                {rows.length > 0 ? (
                  <>
                    {rows.length >= REPORT_CAP && (
                      <p className="clr-note">
                        This report reads the first {REPORT_CAP.toLocaleString()} matching rows.
                        Narrow the filters to be sure you have every learner.
                      </p>
                    )}
                    <div className="table-wrap">
                      <table className="table responsive-table">
                        <thead>
                          <tr>
                            <th scope="col">Learner</th>
                            <th scope="col">Period</th>
                            <th scope="col">Grade &amp; section</th>
                            <th scope="col">Progress</th>
                            <th scope="col">Status</th>
                            <th scope="col">Obligations</th>
                            <th scope="col">Reference</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, index) => {
                            const status = overallStatus(
                              statusByLabel.get(row.status) || ''
                            )
                            return (
                              <tr key={`${row.lrn}-${row.period}-${index}`}>
                                <td data-label="Learner" className="cell-main">
                                  {row.learner}
                                  <span className="subtle block">{row.lrn || 'No LRN'}</span>
                                </td>
                                <td data-label="Period">
                                  {row.period}
                                  <span className="subtle block">
                                    {row.school_year} · {row.clearance_type}
                                  </span>
                                </td>
                                <td data-label="Grade & section">
                                  {row.grade_level || '—'}
                                  {row.section ? ` · ${row.section}` : ''}
                                </td>
                                <td data-label="Progress">
                                  <div className="progress-row">
                                    <div className="pr-top">
                                      <span className="pr-label">{row.progress}%</span>
                                      <span className="pr-value">
                                        {row.settled_departments}/{row.total_departments}
                                      </span>
                                    </div>
                                    <div
                                      className="progress-track"
                                      role="img"
                                      aria-label={`${row.progress} percent complete, ${row.settled_departments} of ${row.total_departments} offices settled`}
                                    >
                                      <div
                                        className={`progress-fill ${status.tone}`}
                                        style={{ width: `${row.progress}%` }}
                                      />
                                    </div>
                                  </div>
                                </td>
                                <td data-label="Status">
                                  <StatusBadge
                                    label={status.label === '—' ? row.status : status.label}
                                    tone={status.tone}
                                  />
                                </td>
                                <td data-label="Obligations">
                                  {row.outstanding_obligations ? (
                                    <StatusBadge
                                      tone="amber"
                                      label={`${row.outstanding_obligations} outstanding`}
                                    />
                                  ) : (
                                    <span className="subtle">None</span>
                                  )}
                                  {row.waived_obligations > 0 && (
                                    <span className="subtle block">
                                      {row.waived_obligations} waived
                                    </span>
                                  )}
                                </td>
                                <td data-label="Reference">
                                  {row.reference ? (
                                    <>
                                      {formatDate(row.cleared_at)}
                                      <span className="subtle block">{row.reference}</span>
                                    </>
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
                  </>
                ) : (
                  <EmptyState
                    icon={active ? 'search' : 'chart'}
                    title={
                      active
                        ? 'No learner matches these filters'
                        : 'Nothing to report yet'
                    }
                    message={
                      active
                        ? 'Widen the filters, or check that the period you meant has been activated.'
                        : 'A period opens a clearance record for every learner it covers when it is activated.'
                    }
                  />
                )}
              </Card>
            </div>

            <div className="stack stack-md">
              <Card
                title="What the same rows say"
                loading={report.loading && !report.data}
                empty={
                  rows.length === 0 ? (
                    <p className="subtle">No rows to add up.</p>
                  ) : null
                }
              >
                <SummaryRows
                  rows={Object.entries(mix).map(([label, count]) => ({
                    label,
                    value: count,
                    total: rows.length,
                    tone:
                      overallStatus(statusByLabel.get(label) || '').tone || 'neutral',
                  }))}
                />
              </Card>

              <Card title="Reading the export">
                <p className="clr-note">
                  The CSV is written by the school, from exactly these filters, and the
                  download is recorded in the clearance log with the person who took it.
                  It carries one row per learner per period: name, LRN, grade and section,
                  period, type, status, progress, the offices settled, obligations opened or
                  waived, and the reference and date of the final approval.
                </p>
                <p className="clr-note">
                  {canExport
                    ? 'Your account holds clearance.export, so the button above writes the file.'
                    : 'Exporting needs clearance.export. Ask the Registrar’s office if you need the file.'}
                </p>
              </Card>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
