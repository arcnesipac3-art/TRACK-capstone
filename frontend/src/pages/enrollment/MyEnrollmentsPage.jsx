import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import { TableSkeleton } from '../../components/loading'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import useFetch from '../../hooks/useFetch'
import { formatDate } from '../../utils/format'
import './EnrollmentPages.css'

/** Confirmed enrollment rows → badge labels (kept local: applicant-side only). */
const ENROLLMENT_STATUS = {
  active: { label: 'Active', tone: 'green' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  pending: { label: 'Pending', tone: 'amber' },
  dropped: { label: 'Dropped', tone: 'red' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
}

function enrollmentStatus(status) {
  return (
    ENROLLMENT_STATUS[status] || {
      label: status ? String(status).replace(/_/g, ' ') : 'Unknown',
      tone: 'neutral',
    }
  )
}

/** Confirmed enrollments (school year, grade level, section) for this account. */
export default function MyEnrollmentsPage() {
  const { data, loading, error, reload } = useFetch('/enrollment/my-enrollments/')

  const rows = Array.isArray(data) ? data : []

  return (
    <div className="stack stack-md">
      <PageHeader
        title="My enrollments"
        subtitle="Enrollments the Registrar has confirmed for this account."
      />

      <section className="card">
        {loading && !data && (
          <TableSkeleton
            headers={['School year', 'Grade level', 'Section', 'Status', 'Confirmed']}
            rows={4}
            label="Loading your enrollments…"
          />
        )}

        {!loading && error && (
          <div className="card-body">
            <ErrorMessage
              error={error}
              title="Could not load your enrollments"
              onRetry={reload}
            />
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="card-body">
            <EmptyState
              icon="gradCap"
              title="No confirmed enrollments yet"
              message="Once the Registrar confirms your enrollment, the record will appear here."
            />
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="table-wrap">
            <table className="table responsive-table">
              <thead>
                <tr>
                  <th>School year</th>
                  <th>Grade level</th>
                  <th>Section</th>
                  <th>Status</th>
                  <th>Confirmed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const badge = enrollmentStatus(row.status)
                  return (
                    <tr key={row.id}>
                      <td data-label="School year" className="cell-main">
                        {row.school_year_label}
                      </td>
                      <td data-label="Grade level">{row.grade_level_name}</td>
                      <td data-label="Section">
                        {row.section_display || <span className="subtle">—</span>}
                      </td>
                      <td data-label="Status">
                        <StatusBadge label={badge.label} tone={badge.tone} />
                      </td>
                      <td data-label="Confirmed">
                        {row.confirmed_at ? (
                          formatDate(row.confirmed_at)
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
        )}
      </section>
    </div>
  )
}
