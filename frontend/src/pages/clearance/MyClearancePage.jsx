import { Link } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/dashboard/Card'
import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import TableSkeleton from '../../components/loading/TableSkeleton'
import useFetch from '../../hooks/useFetch'
import { overallStatus, periodStatus } from '../../utils/clearance'
import { deadlineInfo, formatDate } from '../../utils/format'
import './Clearance.css'

/**
 * The learner's (or guardian's) own clearances.
 *
 * `/clearance/my/` answers with whatever `visible_clearances()` allows — the
 * signed-in learner's records, and for a guardian the records of the learners
 * they are linked to. Nothing here decides who is entitled to what; the server
 * already filtered the list, which is why a row that appears is a row the
 * reader may open. Draft periods are excluded server-side, so a period still
 * being configured never shows up half-built.
 */
export default function MyClearancePage({ scope = 'student' }) {
  const records = useFetch('/clearance/my/', { list: true })
  const rows = records.data || []
  const base = `/${scope}/clearance`

  // A guardian linked to two learners sees both sets of rows, so the column
  // that names the learner only appears when there is more than one person.
  const showsLearner = scope === 'parent' || rows.some((row) => !row.is_self)

  return (
    <div className="stack stack-md">
      <PageHeader
        title={scope === 'parent' ? "Children's Clearance" : 'My Clearance'}
        subtitle={
          scope === 'parent'
            ? 'Each school office your child must be released by, with what is still holding them back.'
            : 'Each school office that must release you, with what is still holding you back.'
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={records.reload}
            loading={records.loading}
          >
            <Icon name="refresh" size={14} />
            Refresh
          </Button>
        }
      />

      {records.error && (
        <Card>
          <div className="alert alert-error" role="alert">
            <span className="grow">{records.error.message}</span>
            <Button variant="secondary" size="sm" onClick={records.reload}>
              Retry
            </Button>
          </div>
        </Card>
      )}

      {!records.loading && !records.error && rows.length === 0 && (
        <Card>
          <EmptyState
            as="h2"
            icon="checkCircle"
            title="No clearance has been opened for you"
            message={
              scope === 'parent'
                ? 'A clearance period appears here once the Registrar activates one that includes your child. Nothing needs to be done before that.'
                : 'A clearance period appears here once the Registrar activates one that includes you. Until then you have nothing to file — the offices set their own requirements per period.'
            }
          />
        </Card>
      )}

      {(rows.length > 0 || records.loading) && (
        <Card
          title={scope === 'parent' ? 'Clearance records' : 'Your clearance records'}
          action={
            rows.length > 0 ? (
              <span className="subtle">
                {rows.length} record{rows.length === 1 ? '' : 's'}
              </span>
            ) : null
          }
          loading={records.loading && rows.length === 0}
          flush={rows.length > 0}
        >
          {records.loading && rows.length === 0 ? (
            <TableSkeleton rows={3} columns={showsLearner ? 6 : 5} />
          ) : (
            <div className="table-wrap">
              <table className="table responsive-table">
                <thead>
                  <tr>
                    {showsLearner && <th scope="col">Learner</th>}
                    <th scope="col">Period</th>
                    <th scope="col">Progress</th>
                    <th scope="col">Status</th>
                    <th scope="col">Closes</th>
                    <th scope="col"> </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const status = overallStatus(row.overall_status)
                    const period = periodStatus(row.period_status)
                    const due = deadlineInfo(row.closes_at)
                    return (
                      <tr key={row.id}>
                        {showsLearner && (
                          <td data-label="Learner" className="cell-main">
                            {row.learner}
                            {row.is_self && (
                              <span className="subtle block">your record</span>
                            )}
                          </td>
                        )}
                        <td data-label="Period">
                          <Link to={`${base}/${row.id}`}>{row.period_name}</Link>
                          <span className="subtle block">
                            {row.school_year} · {row.type_label}
                          </span>
                        </td>
                        <td data-label="Progress">
                          <div className="progress-track" role="img"
                            aria-label={`${row.settled} of ${row.total} offices settled, ${row.progress}%`}>
                            <div
                              className={`progress-fill ${row.cleared ? 'green' : 'blue'}`}
                              style={{ width: `${row.progress}%` }}
                            />
                          </div>
                          <span className="subtle block">
                            {row.settled} of {row.total} offices settled · {row.progress}%
                          </span>
                        </td>
                        <td data-label="Status">
                          <StatusBadge label={row.status_label} tone={status.tone} />
                          {row.reference && (
                            <span className="subtle block">Ref {row.reference}</span>
                          )}
                        </td>
                        <td data-label="Closes">
                          {row.closes_at ? formatDate(row.closes_at) : '—'}
                          <span className="subtle block">
                            {row.cleared ? 'Closed for you' : period.label === 'Active'
                              ? due.label
                              : `${period.label} period`}
                          </span>
                        </td>
                        <td data-label="">
                          <Link className="btn btn-secondary btn-sm" to={`${base}/${row.id}`}>
                            Open checklist
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {rows.length > 0 && (
        <Card title="How a clearance closes">
          <p className="clr-note">
            Each office on your checklist signs you off on its own terms — some
            want a document, some only check their own record, and an office that
            holds nothing against you can mark itself not applicable. The
            Registrar issues the certificate only after every required office has
            settled and anything recorded against you is resolved or waived. Until
            that happens the period stays open on this page, and the checklist
            lists the offices in the order the school set them.
          </p>
        </Card>
      )}
    </div>
  )
}
