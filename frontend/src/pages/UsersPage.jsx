import ButtonLoader from '../components/loading/ButtonLoader'
import { useRef, useState } from 'react'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import TableSkeleton from '../components/loading/TableSkeleton'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import ResetPasswordModal from '../components/admin/ResetPasswordModal'
import UserFormModal from '../components/admin/UserFormModal'
import Icon from '../components/Icon'
import api from '../services/api'
import useFetch from '../hooks/useFetch'
import { roleLabel } from '../utils/format'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmContext'
import Button from '../components/Button'

const TITLES = {
  teacher: ['Teachers', 'Teaching accounts on record.'],
  student: ['Students', 'Learner accounts on record.'],
  parent: ['Parents', 'Guardian accounts on record.'],
}

/** One directory per role — there is no all-accounts screen. */
export default function UsersPage({ role }) {
  const { user: me, can } = useAuth()
  const confirm = useConfirm()
  const [title, subtitle] = TITLES[role]
  const params = { role }
  const { data, loading, error, reload } = useFetch('/users/', {
    list: true,
    params,
  })
  const sections = useFetch('/sections/', { list: true })

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [resetTarget, setResetTarget] = useState(null)
  const [notice, setNotice] = useState(null)
  // Held in a ref, not state: it is never rendered, only collected on success
  // and flushed to `notice` when the dialog is finally dismissed.
  const pendingNotice = useRef(null)

  const users = data || []

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(user) {
    setEditing(user)
    setModalOpen(true)
  }

  /** Deactivate (or reactivate) an account — a PATCH, never a delete. */
  async function toggleActive(user) {
    const next = !user.is_active
    const verb = next ? 'reactivate' : 'deactivate'
    const name = user.full_name || user.username
    if (
      !(await confirm({
        title: `${verb[0].toUpperCase() + verb.slice(1)} ${name}?`,
        message: next
          ? `${name} will be able to sign in again, with the account as it is now.`
          : `${name} will not be able to sign in until the account is reactivated. No record of theirs is deleted.`,
        confirmLabel: next ? 'Reactivate' : 'Deactivate',
        tone: next ? 'primary' : 'danger',
      }))
    ) {
      return
    }
    setBusyId(user.id)
    setActionError(null)
    try {
      await api.patch(`/users/${user.id}/`, { is_active: next })
      reload()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="stack stack-md">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="row row-wrap">
            <StatusBadge
              tone="blue"
              label={`${users.length} ${users.length === 1 ? 'account' : 'accounts'}`}
            />
            {can('users.manage') && (
              <Button variant="primary" size="sm" onClick={openCreate}>
                <Icon name="userPlus" size={15} />
                Add account
              </Button>
            )}
          </div>
        }
      />

      {notice && (
        <div className="alert alert-success" role="status">
          <Icon name="check" size={17} />
          <span className="grow">{notice}</span>
          <Button variant="secondary" size="sm" onClick={() => setNotice(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {actionError && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={17} />
          <span className="grow">{actionError}</span>
          <Button variant="secondary" size="sm" onClick={() => setActionError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <section className="card">
        {loading && !data && (
          <TableSkeleton
            headers={['Name', 'Username', 'Email', 'Role', 'Status', 'Actions']}
            rows={8}
            label="Loading accounts…"
          />
        )}

        {!loading && error && (
          <div className="card-body">
            <ErrorMessage error={error} title="Could not load users" onRetry={reload} />
          </div>
        )}

        {!loading && !error && users.length === 0 && (
          <div className="card-body">
            <EmptyState
              icon="users"
              title="No accounts"
              message="No users match this view yet."
            />
          </div>
        )}

        {!loading && !error && users.length > 0 && (
          <div className="table-wrap table-wrap--pin">
            <table className="table responsive-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isMe = me && user.id === me.id
                  // Django checks the same keys on the write itself — this
                  // only decides which buttons are offered.
                  const canTouch =
                    user.role === 'admin'
                      ? can('users.manage_admins')
                      : user.role === 'student'
                        ? can('students.manage')
                        : can('users.manage')
                  const deptNames = (user.department_detail || []).map((d) => d.name)
                  return (
                    <tr key={user.id}>
                      <td data-label="Name" className="cell-main">
                        {user.full_name || user.username}
                        {isMe && <span className="subtle"> (you)</span>}
                        {user.role === 'admin' && (
                          <span
                            style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap', marginTop: 'var(--space-1)' }}
                          >
                            {user.is_super_admin && (
                              <StatusBadge tone="red" label="Super Admin" />
                            )}
                            {deptNames.map((name) => (
                              <StatusBadge tone="blue" key={name} label={name} />
                            ))}
                            {!user.is_super_admin && deptNames.length === 0 && (
                              <StatusBadge tone="neutral" label="No department" />
                            )}
                          </span>
                        )}
                      </td>
                      <td data-label="Username">{user.username}</td>
                      <td data-label="Email">
                        {user.email || <span className="subtle">—</span>}
                      </td>
                      <td data-label="Role">
                        <StatusBadge label={roleLabel(user.role)} tone="blue" />
                      </td>
                      <td data-label="Status">
                        <StatusBadge
                          label={user.is_active ? 'Active' : 'Inactive'}
                          tone={user.is_active ? 'green' : 'red'}
                        />
                      </td>
                      <td data-label="Actions">
                        <div className="row-actions">
                          {canTouch && (
                            <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(user)}
                            disabled={busyId === user.id}
                          >
                            <Icon name="pencil" size={14} />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setNotice(null)
                              setResetTarget(user)
                            }}
                            disabled={busyId === user.id}
                          >
                            <Icon name="shield" size={14} />
                            Reset password
                          </Button>
                          <Button
                            size="sm"
                            variant={user.is_active ? 'danger' : 'secondary'}
                            onClick={() => toggleActive(user)}
                            disabled={busyId === user.id || isMe}
                            title={
                              isMe
                                ? 'You cannot deactivate your own account.'
                                : undefined
                            }
                          >
                            {busyId === user.id ? (
                              <ButtonLoader />
                            ) : (
                              <Icon name={user.is_active ? 'shield' : 'check'} size={14} />
                            )}
                            {user.is_active ? 'Deactivate' : 'Reactivate'}
                          </Button>
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

      <p className="subtle">
        Accounts are created here by the registrar. Deactivating an account
        keeps its records but blocks sign-in — accounts are never deleted.
      </p>

      <UserFormModal
        key={modalOpen ? (editing ? `edit-${editing.id}` : 'create') : 'closed'}
        open={modalOpen}
        user={editing}
        sections={sections.data || []}
        onClose={() => setModalOpen(false)}
        onSaved={reload}
      />

      <ResetPasswordModal
        key={resetTarget ? `reset-${resetTarget.id}` : 'reset-closed'}
        open={Boolean(resetTarget)}
        user={resetTarget}
        onClose={() => {
          setResetTarget(null)
          // Surface the page-level confirmation only once the registrar has
          // actually dismissed the dialog. Closing it from onDone instead would
          // unmount the modal before its confirmation screen could render, and
          // that screen carries the "tell them the new password" guidance.
          if (pendingNotice.current) {
            setNotice(pendingNotice.current)
            pendingNotice.current = null
          }
        }}
        onDone={(message) => {
          pendingNotice.current =
            message ||
            `Password reset for ${resetTarget?.full_name || resetTarget?.username}.`
        }}
      />
    </div>
  )
}
