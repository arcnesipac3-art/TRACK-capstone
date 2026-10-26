import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import ButtonLoader from '../../components/loading/ButtonLoader'
import TableSkeleton from '../../components/loading/TableSkeleton'
import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import useFetch from '../../hooks/useFetch'
import api from '../../services/api'
import {
  ENROLLMENT_TYPES,
  periodStatus,
} from '../../utils/enrollment'
import { formatDateTime } from '../../utils/format'
import PeriodFormModal from './PeriodFormModal'
import './RegistrarEnrollment.css'

/** True while "now" sits inside the period's own open/close window. */
function withinWindow(period) {
  const now = Date.now()
  const opens = Date.parse(period.opens_at || '')
  const closes = Date.parse(period.closes_at || '')
  if (Number.isNaN(opens) || Number.isNaN(closes)) return false
  return now >= opens && now <= closes
}

function gradeLevelSummary(period) {
  const ids = period.grade_level_ids || []
  return ids.length === 0 ? 'All grade levels' : `${ids.length} selected`
}

function typeSummary(period) {
  const types = period.allowed_enrollment_types
  if (!types || types.length === 0) return 'All types'
  return types.map((t) => ENROLLMENT_TYPES[t] || t).join(', ')
}

/**
 * Enrollment period configuration (Registrar/admin): the application
 * windows per school year — create, edit, close, reopen and delete.
 */
export default function EnrollmentPeriodsPage() {
  const { can } = useAuth()
  const canManage = can('enrollment.manage')

  const { data, loading, error, reload } = useFetch('/enrollment/periods/', {
    list: true,
  })

  const [formModal, setFormModal] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [alert, setAlert] = useState(null)

  const periods = data || []
  const denied = error?.status === 403

  function closeConfirm() {
    if (busy) return
    setConfirm(null)
  }

  async function runConfirmedRequest() {
    if (busy || !confirm) return
    const { type, period } = confirm
    setBusy(true)
    setAlert(null)
    try {
      if (type === 'close') {
        await api.patch(`/enrollment/periods/${period.id}/`, { status: 'closed' })
        setConfirm(null)
        setAlert({
          kind: 'success',
          text: `Period closed — ${period.name || period.school_year_label}.`,
        })
        reload()
      } else if (type === 'reopen') {
        await api.patch(`/enrollment/periods/${period.id}/`, { status: 'open' })
        setConfirm(null)
        setAlert({
          kind: 'success',
          text: `Period reopened — ${period.name || period.school_year_label}.`,
        })
        reload()
      } else if (type === 'delete') {
        await api.delete(`/enrollment/periods/${period.id}/`)
        setConfirm(null)
        setAlert({
          kind: 'success',
          text: `Period deleted — ${period.name || period.school_year_label}.`,
        })
        reload()
      }
    } catch (err) {
      // Keep the dialog open only for validation hints on the form itself;
      // for delete/close conflicts the server message goes to the page.
      setConfirm(null)
      setAlert({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const confirmBody = (() => {
    if (!confirm) return null
    const name = confirm.period.name || confirm.period.school_year_label
    if (confirm.type === 'close')
      return `Close “${name}”? Closing stops new submissions; existing applications are kept.`
    if (confirm.type === 'reopen')
      return `Reopen “${name}”? Applications can be submitted again while the period stays within its opening and closing dates.`
    return `Delete “${name}”? This cannot be undone. The server will refuse if any application already references this period.`
  })()

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Enrollment Periods"
        subtitle="The application windows each school year opens and closes."
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
              New period
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
        {loading && !data && (
          <TableSkeleton
            headers={[
              'Period',
              'Status',
              'Window',
              'Grade levels',
              'Types',
              'Waitlist',
              'Applications',
              'Requirements',
              'Actions',
            ]}
            rows={5}
            label="Loading enrollment periods…"
          />
        )}

        {!loading && denied && (
          <EmptyState
            icon="shield"
            title="You don't have permission"
            message="Ask an administrator for the enrollment.view permission to manage application windows."
          />
        )}

        {!loading && !denied && error && (
          <div className="card-body">
            <ErrorMessage
              error={error}
              title="Could not load enrollment periods"
              onRetry={reload}
            />
          </div>
        )}

        {!loading && !error && periods.length === 0 && (
          <div className="card-body">
            <EmptyState
              icon="calendar"
              title="No enrollment periods yet"
              message="Create the first application window so students can start applying."
              action={
                canManage && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setFormModal({ mode: 'new' })}
                  >
                    <Icon name="plus" size={15} />
                    New period
                  </button>
                )
              }
            />
          </div>
        )}

        {!loading && !error && periods.length > 0 && (
          <div className="table-wrap">
            <table className="table responsive-table">
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Status</th>
                  <th scope="col">Window</th>
                  <th scope="col">Grade levels</th>
                  <th scope="col">Types</th>
                  <th scope="col">Waitlist</th>
                  <th scope="col">Applications</th>
                  <th scope="col">Requirements</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => {
                  const status = periodStatus(period.status)
                  const canDelete = period.application_count === 0
                  const canReopen =
                    period.status !== 'open' && withinWindow(period)
                  return (
                    <tr key={period.id}>
                      <td data-label="Period" className="cell-main">
                        {period.name || `${period.school_year_label} enrollment`}
                        <span className="subtle" style={{ display: 'block' }}>
                          {period.school_year_label}
                        </span>
                      </td>
                      <td data-label="Status">
                        <StatusBadge label={status.label} tone={status.tone} />
                      </td>
                      <td data-label="Window">
                        {formatDateTime(period.opens_at)} –{' '}
                        {formatDateTime(period.closes_at)}
                      </td>
                      <td data-label="Grade levels">{gradeLevelSummary(period)}</td>
                      <td data-label="Types">{typeSummary(period)}</td>
                      <td data-label="Waitlist">
                        {period.allow_waitlist ? (
                          <span className="badge badge-blue">Allowed</span>
                        ) : (
                          <span className="subtle">Off</span>
                        )}
                      </td>
                      <td data-label="Applications">
                        {period.application_count ?? 0}
                      </td>
                      <td data-label="Requirements">
                        {period.requirement_count ?? 0}
                      </td>
                      <td data-label="Actions" className="text-right">
                        {canManage && (
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              aria-label={`Edit ${period.name || period.school_year_label}`}
                              onClick={() => {
                                setAlert(null)
                                setFormModal(period)
                              }}
                            >
                              <Icon name="pencil" size={14} />
                              Edit
                            </button>
                            {period.status === 'open' ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                aria-label={`Close ${period.name || period.school_year_label}`}
                                disabled={busy}
                                onClick={() => {
                                  setAlert(null)
                                  setConfirm({ type: 'close', period })
                                }}
                              >
                                Close period
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                aria-label={`Reopen ${period.name || period.school_year_label}`}
                                disabled={busy || !canReopen}
                                title={
                                  canReopen
                                    ? undefined
                                    : 'Reopening is only possible between the opening and closing dates.'
                                }
                                onClick={() => {
                                  setAlert(null)
                                  setConfirm({ type: 'reopen', period })
                                }}
                              >
                                Reopen
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                className="btn btn-sm btn-danger"
                                aria-label={`Delete ${period.name || period.school_year_label}`}
                                disabled={busy}
                                onClick={() => {
                                  setAlert(null)
                                  setConfirm({ type: 'delete', period })
                                }}
                              >
                                <Icon name="trash" size={14} />
                                Delete
                              </button>
                            )}
                          </div>
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

      <PeriodFormModal
        key={formModal ? `period-${formModal.id || 'new'}` : 'closed'}
        open={Boolean(formModal)}
        period={formModal?.id ? formModal : null}
        onClose={() => setFormModal(null)}
        onSaved={() => {
          reload()
          setAlert({ kind: 'success', text: 'Period saved.' })
        }}
      />

      <Modal
        open={Boolean(confirm)}
        title={
          confirm?.type === 'close'
            ? 'Close this period?'
            : confirm?.type === 'reopen'
              ? 'Reopen this period?'
              : 'Delete this period?'
        }
        onClose={closeConfirm}
        dismissible={!busy}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={closeConfirm}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`btn btn-sm ${confirm?.type === 'delete' ? 'btn-danger' : 'btn-primary'}`}
              onClick={runConfirmedRequest}
              disabled={busy}
            >
              {busy && <ButtonLoader />}
              {busy
                ? 'Working…'
                : confirm?.type === 'delete'
                  ? 'Delete period'
                  : confirm?.type === 'close'
                    ? 'Close period'
                    : 'Reopen period'}
            </button>
          </>
        }
      >
        <p>{confirmBody}</p>
        {confirm?.type === 'close' && (
          <p className="subtle" style={{ marginTop: 8 }}>
            Students can no longer submit new applications while the period is
            closed; everything already submitted stays exactly as it is.
          </p>
        )}
      </Modal>
    </div>
  )
}
