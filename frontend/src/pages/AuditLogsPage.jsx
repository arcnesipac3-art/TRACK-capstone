import { useState } from 'react'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import Icon from '../components/Icon'
import LoadingSpinner from '../components/LoadingSpinner'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import useFetch from '../hooks/useFetch'
import { formatDateTime } from '../utils/format'

/** All known audit action values produced by the backend. */
const ACTION_OPTIONS = [
  { value: '',                        label: 'All actions' },
  { value: 'auth.login',              label: 'Sign in' },
  { value: 'auth.logout',             label: 'Sign out' },
  { value: 'auth.password_reset',     label: 'Password reset' },
  { value: 'user.created',            label: 'User created' },
  { value: 'user.updated',            label: 'User updated' },
  { value: 'user.deleted',            label: 'User deleted' },
  { value: 'permissions.user_updated',       label: 'User permissions updated' },
  { value: 'permissions.department_updated', label: 'Department permissions updated' },
  { value: 'department.created',      label: 'Department created' },
  { value: 'department.updated',      label: 'Department updated' },
  { value: 'department.deleted',      label: 'Department deleted' },
  { value: 'fee_assessment.created',  label: 'Fee assessment created' },
  { value: 'fee_assessment.updated',  label: 'Fee assessment updated' },
  { value: 'fee_assessment.archived', label: 'Fee assessment archived' },
  { value: 'fee_payment.recorded',    label: 'Fee payment recorded' },
  { value: 'fee_payment.voided',      label: 'Fee payment voided' },
  { value: 'fee_payment.reversed',    label: 'Fee payment reversed' },
]

export default function AuditLogsPage() {
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const params = {
    search: search.trim() || undefined,
    action: action || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  }
  const { data, loading, error, reload } = useFetch('/audit-logs/', {
    list: true,
    params,
  })

  const entries = data || []
  const hasFilters = Boolean(search.trim() || action || dateFrom || dateTo)

  function clearFilters() {
    setSearch('')
    setAction('')
    setDateFrom('')
    setDateTo('')
  }

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Audit Logs"
        subtitle="Every administrative action, recorded by the server as it happens."
        actions={
          <span className="badge badge-blue">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            {hasFilters ? ' (filtered)' : ''}
          </span>
        }
      />

      <section className="card">
        <div className="card-body">
          <div className="row row-wrap" style={{ gap: 12, alignItems: 'flex-end' }}>
            <div className="field grow" style={{ minWidth: 200 }}>
              <label htmlFor="audit-search">Search</label>
              <input
                id="audit-search"
                className="input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Description or actor…"
              />
            </div>
            <div className="field" style={{ minWidth: 210 }}>
              <label htmlFor="audit-action">Action</label>
              <select
                id="audit-action"
                className="select"
                value={action}
                onChange={(e) => setAction(e.target.value)}
              >
                {ACTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: 150 }}>
              <label htmlFor="audit-from">From</label>
              <input
                id="audit-from"
                className="input"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="field" style={{ minWidth: 150 }}>
              <label htmlFor="audit-to">To</label>
              <input
                id="audit-to"
                className="input"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            {hasFilters && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="card">
        {loading && !data && <LoadingSpinner block label="Loading audit log…" />}

        {!loading && error && (
          <div className="card-body">
            <ErrorMessage error={error} title="Could not load the audit log" onRetry={reload} />
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="card-body">
            <EmptyState
              icon="clock"
              title={hasFilters ? 'No matching entries' : 'No recorded activity yet'}
              message={
                hasFilters
                  ? 'Try a wider search or clear the filters.'
                  : 'Account, department and permission changes will appear here.'
              }
            />
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <div className="table-wrap">
            <table className="table responsive-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td data-label="When">{formatDateTime(entry.timestamp)}</td>
                    <td data-label="Who" className="cell-main">
                      {entry.actor_name || <span className="subtle">System</span>}
                    </td>
                    <td data-label="Action">
                      <StatusBadge label={entry.action} tone="blue" />
                    </td>
                    <td data-label="Target">
                      {entry.target_model ? (
                        <>
                          {entry.target_model}
                          {entry.target_id ? ` #${entry.target_id}` : ''}
                        </>
                      ) : (
                        <span className="subtle">—</span>
                      )}
                    </td>
                    <td data-label="Details">
                      {entry.description || <span className="subtle">—</span>}
                      {entry.ip_address && (
                        <span className="subtle" style={{ display: 'block' }}>
                          <Icon name="info" size={12} /> {entry.ip_address}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="subtle">
        The audit log is read-only: entries are written by the backend when the
        action happens and cannot be edited or deleted through the API.
      </p>
    </div>
  )
}
