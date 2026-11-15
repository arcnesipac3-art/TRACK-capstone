import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/Button'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import Icon from '../../components/Icon'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import TableSkeleton from '../../components/loading/TableSkeleton'
import { useAuth } from '../../context/AuthContext'
import useFetch from '../../hooks/useFetch'
import api from '../../services/api'
import { CLEARANCE_TYPES, openWindow, periodStatus } from '../../utils/clearance'
import './Clearance.css'
import PeriodFormModal from './PeriodFormModal'

/**
 * The lifecycle an administrator can put a period through, and the verb each
 * one is offered as. `provision` is here too because backfilling learners is
 * a routine act on a running period, not a configuration edit.
 */
const LIFECYCLE = {
  activate: {
    label: 'Activate',
    variant: 'primary',
    question: (name) => `Activate “${name}”?`,
    detail:
      'Every learner in this period’s grade levels and categories gets a clearance record and a queue at each active department, and is notified. Learners already holding a record keep their progress.',
    confirm: 'Activate period',
  },
  deactivate: {
    label: 'Close',
    variant: 'secondary',
    question: (name) => `Close “${name}”?`,
    detail:
      'Learners can no longer submit documents and departments cannot record a decision. Everything already recorded stays on the record.',
    confirm: 'Close period',
  },
  reopen: {
    label: 'Reopen',
    variant: 'secondary',
    question: (name) => `Reopen “${name}”?`,
    detail:
      'Submissions and department decisions start again for the same records — nothing is re-created and no decision is erased.',
    confirm: 'Reopen period',
  },
  archive: {
    label: 'Archive',
    variant: 'secondary',
    question: (name) => `Archive “${name}”?`,
    detail:
      'The period leaves the active lists and stays readable in the reports. Archiving is the honest end of a term; deleting a period whose learners already have records would erase their decisions.',
    confirm: 'Archive period',
  },
  provision: {
    label: 'Backfill learners',
    variant: 'ghost',
    question: (name) => `Re-check the learners in “${name}”?`,
    detail:
      'Opens a clearance record for every learner now in scope who does not have one — a learner enrolled or moved into a covered grade level since activation. Existing records are left alone.',
    confirm: 'Backfill now',
  },
}

/** Which actions this row offers, in the order the buttons read. */
function actionsFor(period) {
  if (period.status === 'draft') return ['activate']
  if (period.status === 'active') return ['provision', 'deactivate']
  if (period.status === 'closed') return ['reopen', 'archive']
  return []
}

export default function ClearancePeriodsPage() {
  const { can } = useAuth()
  const canManage = can('clearance.manage')
  const options = useFetch('/clearance/options/')
  const [filters, setFilters] = useState({ status: '', clearance_type: '' })
  const [form, setForm] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [forcedArchive, setForcedArchive] = useState(null)
  const [busy, setBusy] = useState(false)
  const [alert, setAlert] = useState(null)

  const list = useFetch('/clearance/periods/', {
    list: true,
    params: filters,
  })
  const periods = list.data || []
  const denied = list.error?.status === 403

  function narrow(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  async function runAction({ action, period }, force = false) {
    setBusy(true)
    setAlert(null)
    try {
      const result = await api.post(
        `/clearance/periods/${period.id}/${action}/`,
        action === 'archive' && force ? { confirm_unfinished: true } : {}
      )
      setConfirm(null)
      setForcedArchive(null)
      setAlert({
        kind: 'success',
        text: summaryOf(action, period, result),
      })
      list.reload()
    } catch (err) {
      setConfirm(null)
      // An archive with learners still uncalled is a real situation, not a
      // mistake — the server refuses once so the decision is informed, and the
      // screen asks again with that answer in front of the administrator.
      if (action === 'archive' && /not cleared yet/.test(err.message)) {
        setForcedArchive(period)
      } else {
        setAlert({ kind: 'error', text: err.message })
      }
    } finally {
      setBusy(false)
    }
  }

  async function removePeriod(period) {
    setBusy(true)
    setAlert(null)
    try {
      await api.delete(`/clearance/periods/${period.id}/`)
      setConfirm(null)
      setAlert({ kind: 'success', text: `“${period.name}” deleted.` })
      list.reload()
    } catch (err) {
      setConfirm(null)
      setAlert({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Clearance Periods"
        subtitle="Each term the school runs clearances for, and the offices that take part in it."
        actions={
          canManage && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setAlert(null)
                setForm({ mode: 'new' })
              }}
            >
              <Icon name="plus" size={15} />
              New period
            </Button>
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
          <Button variant="secondary" size="sm" onClick={() => setAlert(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <div className="filter-bar">
        <div className="field">
          <label htmlFor="clr-filter-status">Status</label>
          <select
            id="clr-filter-status"
            className="select"
            value={filters.status}
            onChange={(e) => narrow('status', e.target.value)}
          >
            <option value="">All statuses</option>
            {(options.data?.period_statuses || []).map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="clr-filter-type">Clearance type</label>
          <select
            id="clr-filter-type"
            className="select"
            value={filters.clearance_type}
            onChange={(e) => narrow('clearance_type', e.target.value)}
          >
            <option value="">All types</option>
            {(options.data?.clearance_types || []).map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>
        {(filters.status || filters.clearance_type) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilters({ status: '', clearance_type: '' })}
          >
            Clear filters
          </Button>
        )}
      </div>

      <section className="card">
        {list.loading && !list.data && (
          <TableSkeleton
            headers={['Period', 'Status', 'Window', 'Departments', 'Learners', 'Actions']}
            rows={4}
            label="Loading clearance periods…"
          />
        )}

        {!list.loading && denied && (
          <EmptyState
            as="h2"
            icon="shield"
            title="You don't have permission"
            message="Clearance periods need the clearance.view permission. Configuration lives with the Registrar's office."
          />
        )}

        {!list.loading && !denied && list.error && (
          <div className="card-body">
            <ErrorMessage error={list.error} title="Could not load clearance periods" onRetry={list.reload} />
          </div>
        )}

        {!list.loading && !list.error && periods.length === 0 && (
          <div className="card-body">
            <EmptyState
              as="h2"
              icon="calendar"
              title={
                filters.status || filters.clearance_type
                  ? 'No period matches these filters'
                  : 'No clearance periods yet'
              }
              message={
                filters.status || filters.clearance_type
                  ? 'Widen the filters to see the rest of the list.'
                  : 'Create a period, add the departments that must sign off, then activate it for the learners it covers.'
              }
              action={
                canManage && !filters.status && !filters.clearance_type && (
                  <Button variant="primary" size="sm" onClick={() => setForm({ mode: 'new' })}>
                    <Icon name="plus" size={15} />
                    New period
                  </Button>
                )
              }
            />
          </div>
        )}

        {!list.loading && !list.error && periods.length > 0 && (
          <div className="table-wrap">
            <table className="table responsive-table">
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Status</th>
                  <th scope="col">Window</th>
                  <th scope="col">Departments</th>
                  <th scope="col">Learners cleared</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => {
                  const status = periodStatus(period.status)
                  return (
                    <tr key={period.id}>
                      <td data-label="Period" className="cell-main">
                        <Link to={`/admin/clearance/periods/${period.id}`}>{period.name}</Link>
                        <span className="subtle block">
                          {period.school_year_label} · {CLEARANCE_TYPES[period.clearance_type] || period.type_label}
                          {period.status === 'draft' ? ' · not yet activated' : ''}
                        </span>
                      </td>
                      <td data-label="Status">
                        <StatusBadge label={status.label} tone={status.tone} />
                      </td>
                      <td data-label="Window">
                        {openWindow(period)}
                        <span className="subtle block">
                          <Link to={`/admin/clearance/learners?period=${period.id}`}>
                            View learners
                          </Link>
                        </span>
                      </td>
                      <td data-label="Departments">
                        {period.department_count} active
                        <span className="subtle block">
                          {period.status === 'draft' ? (
                            <Link to={`/admin/clearance/periods/${period.id}`}>
                              Add departments
                            </Link>
                          ) : (
                            <Link to={`/admin/clearance/periods/${period.id}`}>
                              Configure
                            </Link>
                          )}
                        </span>
                      </td>
                      <td data-label="Learners cleared">
                        {period.learner_count ? (
                          <div className="progress-row">
                            <div className="pr-top">
                              <span className="pr-label">{period.learner_count} learner(s)</span>
                              <span className="pr-value">{period.cleared_count}</span>
                            </div>
                            <div
                              className="progress-track"
                              role="img"
                              aria-label={`${period.cleared_count} of ${period.learner_count} cleared`}
                            >
                              <div
                                className="progress-fill green"
                                style={{
                                  width: `${Math.round((100 * period.cleared_count) / period.learner_count)}%`,
                                }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="subtle">No records yet</span>
                        )}
                      </td>
                      <td data-label="Actions" className="text-right">
                        <div className="row-actions">
                          {canManage && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Edit ${period.name}`}
                                onClick={() => {
                                  setAlert(null)
                                  setForm(period)
                                }}
                              >
                                <Icon name="pencil" size={14} />
                                Edit
                              </Button>
                              {actionsFor(period).map((action) => (
                                <Button
                                  key={action}
                                  variant={LIFECYCLE[action].variant}
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => {
                                    setAlert(null)
                                    setConfirm({ action, period })
                                  }}
                                >
                                  {LIFECYCLE[action].label}
                                </Button>
                              ))}
                              {period.status === 'draft' && period.learner_count === 0 && (
                                <Button
                                  variant="danger"
                                  size="sm"
                                  disabled={busy}
                                  aria-label={`Delete ${period.name}`}
                                  onClick={() => {
                                    setAlert(null)
                                    setConfirm({ action: 'delete', period })
                                  }}
                                >
                                  <Icon name="trash" size={14} />
                                  Delete
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PeriodFormModal
        key={form ? `period-${form.id || 'new'}` : 'closed'}
        open={Boolean(form)}
        period={form?.id ? form : null}
        options={options.data}
        onClose={() => setForm(null)}
        onSaved={(saved) => {
          setForm(null)
          setAlert({
            kind: 'success',
            text: saved?.id
              ? `“${saved.name}” saved.`
              : 'Period saved.',
          })
          list.reload()
        }}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.action === 'delete'
            ? `Delete “${confirm.period.name}”?`
            : LIFECYCLE[confirm?.action]?.question(confirm?.period.name || '')
        }
        message={
          confirm?.action === 'delete'
            ? 'This period has no learner records, so deleting it loses nothing but the configuration.'
            : LIFECYCLE[confirm?.action]?.detail
        }
        detail={
          confirm?.action === 'delete'
            ? 'Archived periods keep their records and stay in the reports; a deleted period cannot be recovered.'
            : undefined
        }
        confirmLabel={
          confirm?.action === 'delete'
            ? 'Delete period'
            : LIFECYCLE[confirm?.action]?.confirm
        }
        tone={confirm?.action === 'delete' ? 'danger' : 'primary'}
        onConfirm={() =>
          confirm?.action === 'delete' ? removePeriod(confirm.period) : runAction(confirm)
        }
        onCancel={() => !busy && setConfirm(null)}
      />

      <ConfirmDialog
        open={Boolean(forcedArchive)}
        title="Learners are still not cleared"
        message={
          forcedArchive
            ? `“${forcedArchive.name}” still has learners who are not cleared. The server will only archive it once you confirm the term is over.`
            : ''
        }
        detail="Their records stay exactly as they are and remain readable in the reports and in each learner's history."
        confirmLabel="Archive anyway"
        tone="danger"
        onConfirm={() => runAction({ action: 'archive', period: forcedArchive }, true)}
        onCancel={() => !busy && setForcedArchive(null)}
      />
    </div>
  )
}

/** What the server actually did, in the words the page reports back. */
function summaryOf(action, period, result) {
  const name = period.name
  if (action === 'activate') {
    const records = result?.records ?? 0
    return `“${name}” is open — ${records} new learner record(s) created.`
  }
  if (action === 'provision') {
    return `Checked the learners in “${name}” — ${result?.records ?? 0} new record(s).`
  }
  if (action === 'deactivate') return `“${name}” is closed.`
  if (action === 'reopen') return `“${name}” is open again.`
  return `“${name}” archived.`
}
