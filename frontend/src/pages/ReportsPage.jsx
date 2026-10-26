import { useState } from 'react'
import Card, { SummaryRows } from '../components/dashboard/Card'
import ErrorMessage from '../components/ErrorMessage'
import Icon from '../components/Icon'
import CardSkeleton from '../components/loading/CardSkeleton'
import ButtonLoader from '../components/loading/ButtonLoader'
import PageHeader from '../components/PageHeader'
import TrendsCard from '../components/dashboard/TrendsCard'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import useFetch from '../hooks/useFetch'

/**
 * School-wide reports.
 *
 * The figures come straight from the dashboard payload — the same real counts
 * Django shows every administrator, scoped to the modules this one holds.
 * Financial reports (fee collection and outstanding balances) live on the
 * Fees screen's Reports tab, which already carries their filters and export.
 *
 * Exports are gated on `reports.export` in the interface, and every fetch
 * behind them is gated again by Django on its own endpoint.
 */
export default function ReportsPage() {
  const { can } = useAuth()
  const summary = useFetch('/dashboard/')
  const trends = useFetch('/reports/trends/')
  const [exporting, setExporting] = useState(null)
  const [exportError, setExportError] = useState(null)

  const canExport = can('reports.export')
  const blocks = summary.data?.blocks || {}
  const accounts = blocks.accounts
  const attendance = blocks.attendance
  const requirements = blocks.requirements

  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  function downloadCsv(rows, filename, headers) {
    if (!rows || rows.length === 0) return
    const lines = [
      headers.map((h) => escape(h.label)).join(','),
      ...rows.map((row) => headers.map((h) => escape(h.get(row))).join(',')),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  /** Fetch the underlying rows, then hand them to the CSV builder. */
  async function runExport(key, fetchRows, build) {
    setExporting(key)
    setExportError(null)
    try {
      const rows = await fetchRows()
      build(rows)
    } catch (err) {
      setExportError(err.message)
    } finally {
      setExporting(null)
    }
  }

  const exportButtons = canExport && (
    <div className="row row-wrap" style={{ gap: 8 }}>
      {can('users.view') && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={exporting !== null}
          onClick={() =>
            runExport(
              'accounts',
              () => api.list('/users/'),
              (rows) =>
                downloadCsv(rows, 'accounts-report.csv', [
                  { label: 'Name', get: (r) => r.full_name || r.username },
                  { label: 'Username', get: (r) => r.username },
                  { label: 'Email', get: (r) => r.email },
                  { label: 'Role', get: (r) => r.role },
                  { label: 'Status', get: (r) => (r.is_active ? 'Active' : 'Inactive') },
                  {
                    label: 'Department',
                    get: (r) =>
                      (r.department_detail || []).map((d) => d.name).join('; '),
                  },
                  { label: 'Super Administrator', get: (r) => (r.is_super_admin ? 'Yes' : 'No') },
                ])
            )
          }
          aria-busy={exporting === 'accounts'}
        >
          {exporting === 'accounts' && <ButtonLoader />}
          <Icon name="download" size={14} />{' '}
          {exporting === 'accounts' ? 'Exporting…' : 'Accounts'}
        </button>
      )}
      {can('students.view') && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={exporting !== null}
          onClick={() =>
            runExport(
              'students',
              () => api.list('/students/'),
              (rows) =>
                downloadCsv(rows, 'student-directory.csv', [
                  { label: 'Name', get: (r) => r.user?.full_name || r.user?.username },
                  { label: 'LRN', get: (r) => r.lrn },
                  { label: 'Section', get: (r) => r.section_name },
                  { label: 'Status', get: (r) => (r.user?.is_active ? 'Active' : 'Inactive') },
                ])
            )
          }
          aria-busy={exporting === 'students'}
        >
          {exporting === 'students' && <ButtonLoader />}
          <Icon name="download" size={14} />{' '}
          {exporting === 'students' ? 'Exporting…' : 'Student directory'}
        </button>
      )}
      {attendance && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={exporting !== null}
          onClick={() =>
            runExport('attendance', async () => attendance, (data) =>
              downloadCsv(
                Object.entries(data.by_status || {}).map(([status, count]) => ({
                  status,
                  count,
                })),
                'attendance-summary.csv',
                [
                  { label: 'Status', get: (r) => r.status },
                  { label: 'Records', get: (r) => r.count },
                ]
              )
            )
          }
          aria-busy={exporting === 'attendance'}
        >
          {exporting === 'attendance' && <ButtonLoader />}
          <Icon name="download" size={14} />{' '}
          {exporting === 'attendance' ? 'Exporting…' : 'Attendance summary'}
        </button>
      )}
      {requirements && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={exporting !== null}
          onClick={() =>
            runExport('submissions', async () => requirements, (data) =>
              downloadCsv(
                Object.entries(data.submission_status || {}).map(([status, count]) => ({
                  status,
                  count,
                })),
                'submissions-summary.csv',
                [
                  { label: 'Status', get: (r) => r.status },
                  { label: 'Submissions', get: (r) => r.count },
                ]
              )
            )
          }
          aria-busy={exporting === 'submissions'}
        >
          {exporting === 'submissions' && <ButtonLoader />}
          <Icon name="download" size={14} />{' '}
          {exporting === 'submissions' ? 'Exporting…' : 'Submissions summary'}
        </button>
      )}
    </div>
  )

  if (summary.loading && !summary.data) {
    return (
      <div className="stack stack-md">
        <PageHeader title="Reports" subtitle="School-wide figures, straight from the records." />
        <CardSkeleton lines={4} label="Loading reports…" />
      </div>
    )
  }

  if (summary.error) {
    return (
      <div className="stack stack-md">
        <PageHeader title="Reports" subtitle="School-wide figures, straight from the records." />
        <ErrorMessage
          error={summary.error}
          title="Could not load the report data"
          onRetry={summary.reload}
        />
      </div>
    )
  }

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Reports"
        subtitle="School-wide figures, straight from the records."
        actions={exportButtons}
      />

      {exportError && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={17} />
          <span className="grow">Export failed: {exportError}</span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setExportError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <TrendsCard
        months={trends.data?.months}
        loading={trends.loading && !trends.data}
        error={trends.error}
        onRetry={trends.reload}
      />

      <div className="two-col">
        <div className="stack stack-md">
          {accounts && (
            <Card title="Accounts">
              <SummaryRows
                rows={[
                  { label: 'Students', value: accounts.total_students, tone: 'blue', total: accounts.total_users },
                  { label: 'Teachers', value: accounts.total_teachers, tone: 'blue', total: accounts.total_users },
                  { label: 'Parents', value: accounts.total_parents, tone: 'blue', total: accounts.total_users },
                ].map((row) => ({ ...row, showPercent: true }))}
              />
              <p className="subtle" style={{ marginTop: 10 }}>
                {accounts.total_users} user accounts in total.
              </p>
            </Card>
          )}

          {requirements && (
            <Card title="Requirements & submissions">
              <SummaryRows
                rows={Object.entries(requirements.submission_status || {})
                  .filter(([, count]) => count > 0)
                  .map(([status, count]) => ({
                    label:
                      status === 'none'
                        ? 'Not yet submitted'
                        : status.charAt(0).toUpperCase() + status.slice(1),
                    value: count,
                    tone:
                      status === 'verified'
                        ? 'green'
                        : status === 'returned' || status === 'overdue'
                          ? 'red'
                          : 'amber',
                  }))}
              />
              <p className="subtle" style={{ marginTop: 10 }}>
                {requirements.total_requirements} requirements on record ·{' '}
                {requirements.awaiting_verification} awaiting verification ·{' '}
                {requirements.total_submissions} submissions in total.
              </p>
            </Card>
          )}

          {!accounts && !requirements && !attendance && (
            <Card title="No reportable modules">
              <p className="subtle">
                Your departments do not carry report data yet. Reports appear
                here as soon as an administrator grants the relevant
                permissions.
              </p>
            </Card>
          )}
        </div>

        <div className="stack stack-md">
          {attendance && (
            <Card title="Attendance">
              <SummaryRows
                rows={(() => {
                  const entries = Object.entries(attendance.by_status || {})
                  const total = entries.reduce((sum, [, count]) => sum + count, 0)
                  return entries.map(([status, count]) => ({
                    label: status.charAt(0).toUpperCase() + status.slice(1),
                    value: count,
                    tone:
                      status === 'present'
                        ? 'green'
                        : status === 'absent'
                          ? 'red'
                          : 'amber',
                    total,
                  }))
                })()}
              />
              <p className="subtle" style={{ marginTop: 10 }}>
                {attendance.present_rate != null
                  ? `${attendance.present_rate}% present, all records counted.`
                  : 'No attendance records yet.'}
              </p>
            </Card>
          )}

          {can('fees.view') && (
            <Card title="Financial reports">
              <p className="subtle">
                Fee collection and outstanding balance reports — with their own
                school-year and category filters — live on the Fees screen
                under Reports.
              </p>
              <p style={{ marginTop: 10 }}>
                <a className="btn btn-secondary btn-sm" href="/admin/fees">
                  <Icon name="creditCard" size={14} /> Open fee reports
                </a>
              </p>
            </Card>
          )}

          {!canExport && (
            <Card title="Exports">
              <p className="subtle">
                Exporting report data out of the system requires the
                &ldquo;Export reports&rdquo; permission.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
