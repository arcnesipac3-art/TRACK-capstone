import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/dashboard/Card'
import EmptyState from '../../components/EmptyState'
import Icon from '../../components/Icon'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import ObligationActionModal from './ObligationActionModal'
import { useAuth } from '../../context/AuthContext'
import api from '../../services/api'
import useFetch from '../../hooks/useFetch'
import { OBLIGATION_STATUS, obligationStatus } from '../../utils/clearance'
import { formatCurrency, formatDate, formatDateTime } from '../../utils/format'
import './Clearance.css'

/**
 * Every obligation the school has recorded, open or closed.
 *
 * A waiver is a decision somebody should be able to find again, so this list
 * does not hide the settled ones behind a default filter — it just puts the
 * outstanding ones first. Only an office's own personnel may act on its rows;
 * the button is shown from the same membership the server checks, and the
 * server's answer is what actually decides.
 */
export default function ClearanceObligationsPage() {
  const [searchParams] = useSearchParams()
  const { can } = useAuth()

  const [filters, setFilters] = useState(() => ({
    period: searchParams.get('period') || '',
    department: searchParams.get('department') || '',
    status: searchParams.get('status') || '',
  }))
  const [target, setTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const options = useFetch('/clearance/options/')
  const periods = useFetch('/clearance/periods/', { list: true })
  const read = useFetch('/clearance/obligations/', { params: filters })

  const obligations = read.data?.obligations || []
  const canVerify = can('clearance.verify')

  // `/clearance/obligations/` names the office rather than identifying it, and
  // the options payload carries the membership answer per department — the name
  // is unique, so this is a lookup. It mirrors `_officer_of`; the server's
  // answer is still what decides.
  const officerOf = (departmentName) =>
    (options.data?.departments || []).some(
      (department) => department.name === departmentName && department.can_verify
    )

  function narrow(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function openAction(obligation, mode) {
    setError(null)
    setNotice(null)
    setTarget({ obligation, mode })
  }

  async function submit(body) {
    setBusy(true)
    setError(null)
    try {
      const result = await api.post(
        `/clearance/obligations/${target.obligation.id}/action/`,
        body
      )
      setTarget(null)
      setNotice(
        `“${result.title}” is now ${obligationStatus(result.status).label.toLowerCase()}.`
      )
      read.reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const denied = read.error?.status === 403

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Outstanding Obligations"
        subtitle="What the offices recorded against a learner, and who settled or waived it."
        actions={
          can('clearance.manage') && (
            <Link className="clr-chip" to="/admin/clearance/configuration">
              <Icon name="settings" size={14} />
              Obligation kinds
            </Link>
          )
        }
      />

      {notice && (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      )}

      {denied ? (
        <Card>
          <EmptyState
            as="h2"
            icon="shield"
            title="You don't have permission"
            message="The obligation ledger needs the clearance.view permission."
          />
        </Card>
      ) : (
        <>
          <div className="filter-bar">
            <div className="field">
              <label htmlFor="clr-ob-period">Period</label>
              <select
                id="clr-ob-period"
                className="select"
                value={filters.period}
                onChange={(event) => narrow('period', event.target.value)}
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
              <label htmlFor="clr-ob-department">Department</label>
              <select
                id="clr-ob-department"
                className="select"
                value={filters.department}
                onChange={(event) => narrow('department', event.target.value)}
              >
                <option value="">Every office</option>
                {(options.data?.departments || []).map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="clr-ob-status">Status</label>
              <select
                id="clr-ob-status"
                className="select"
                value={filters.status}
                onChange={(event) => narrow('status', event.target.value)}
              >
                <option value="">Outstanding and closed</option>
                {Object.entries(OBLIGATION_STATUS).map(([value, meta]) => (
                  <option key={value} value={value}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>

            {(filters.period || filters.department || filters.status) && (
              <div className="field grow">
                <span className="subtle">&nbsp;</span>
                <div className="row row-wrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilters({ period: '', department: '', status: '' })}
                  >
                    Clear filters
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Card
            title="Obligations"
            action={
              <span className="subtle">
                {read.data?.total ?? 0} record{read.data?.total === 1 ? '' : 's'}
              </span>
            }
            loading={read.loading && !read.data}
            error={read.error}
            onRetry={read.reload}
            flush={obligations.length > 0}
          >
            {obligations.length > 0 ? (
              <div className="table-wrap">
                <table className="table responsive-table">
                  <thead>
                    <tr>
                      <th scope="col">Learner</th>
                      <th scope="col">Office</th>
                      <th scope="col">What is owed</th>
                      <th scope="col">Status</th>
                      <th scope="col">Recorded by</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {obligations.map((obligation) => {
                      const status = obligationStatus(obligation.status)
                      const settled =
                        obligation.status === 'resolved'
                          ? `${obligation.resolved_by_name} · ${formatDate(
                              obligation.resolved_at
                            )}`
                          : obligation.status === 'waived'
                            ? `${obligation.waived_by_name} · ${formatDate(
                                obligation.waived_at
                              )}`
                            : null
                      const actsHere = canVerify && officerOf(obligation.department)
                      return (
                        <tr key={obligation.id}>
                          <td data-label="Learner" className="cell-main">
                            <Link to={`/admin/clearance/queue/${obligation.department_clearance}`}>
                              {obligation.learner}
                            </Link>
                            <span className="subtle block">
                              Open this office&apos;s item
                            </span>
                          </td>
                          <td data-label="Office">
                            {obligation.department}
                            <span className="subtle block">
                              {obligation.is_blocking ? 'Blocks the sign-off' : 'Advisory'}
                            </span>
                          </td>
                          <td data-label="What is owed">
                            {obligation.title}
                            {obligation.amount && Number(obligation.amount) > 0 && (
                              <span className="subtle block">
                                {formatCurrency(obligation.amount)}
                              </span>
                            )}
                            {obligation.detail && (
                              <span className="subtle block">{obligation.detail}</span>
                            )}
                          </td>
                          <td data-label="Status">
                            <StatusBadge
                              label={obligation.status_label || status.label}
                              tone={status.tone}
                            />
                            {settled && (
                              <span className="subtle block">{settled}</span>
                            )}
                            {obligation.waiver_reason && (
                              <span className="subtle block">
                                “{obligation.waiver_reason}”
                              </span>
                            )}
                            {obligation.resolution_note && (
                              <span className="subtle block">
                                “{obligation.resolution_note}”
                              </span>
                            )}
                          </td>
                          <td data-label="Recorded by">
                            {obligation.created_by_name || '—'}
                            <span className="subtle block">
                              {formatDateTime(obligation.created_at)}
                            </span>
                          </td>
                          <td data-label="Actions" className="text-right">
                            {actsHere ? (
                              <div className="row-actions">
                                {obligation.status === 'open' ? (
                                  <>
                                    <Button
                                      variant="primary"
                                      size="sm"
                                      onClick={() => openAction(obligation, 'resolve')}
                                    >
                                      Settle
                                    </Button>
                                    <Button
                                      variant="danger"
                                      size="sm"
                                      onClick={() => openAction(obligation, 'waive')}
                                    >
                                      Waive
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openAction(obligation, 'update')}
                                    >
                                      Edit
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => openAction(obligation, 'reopen')}
                                    >
                                      Reopen
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openAction(obligation, 'update')}
                                    >
                                      Edit
                                    </Button>
                                  </>
                                )}
                              </div>
                            ) : (
                              <span className="subtle">
                                {obligation.department} personnel
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon="checkCircle"
                title="Nothing recorded against anybody"
                message={
                  filters.period || filters.department || filters.status
                    ? 'No obligation matches these filters — an obligation is only ever written by the office that holds it.'
                    : 'Obligations are raised by an office on a learner’s item, never by the clearance itself.'
                }
              />
            )}
          </Card>
        </>
      )}

      <ObligationActionModal
        open={Boolean(target)}
        mode={target?.mode}
        obligation={target?.obligation}
        busy={busy}
        error={error}
        onClose={() => setTarget(null)}
        onSubmit={submit}
      />
    </div>
  )
}
