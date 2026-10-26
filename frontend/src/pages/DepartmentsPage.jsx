import ButtonLoader from '../components/loading/ButtonLoader'
import { useState } from 'react'
import DepartmentFormModal from '../components/admin/DepartmentFormModal'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import Icon from '../components/Icon'
import TableSkeleton from '../components/loading/TableSkeleton'
import PageHeader from '../components/PageHeader'
import PermissionMatrixModal from '../components/admin/PermissionMatrixModal'
import StatusBadge from '../components/StatusBadge'
import api from '../services/api'
import useFetch from '../hooks/useFetch'
import { useAuth } from '../context/AuthContext'

/**
 * Department & role management.
 *
 * Departments are the unit administrators belong to; each one carries its own
 * permission matrix (the dialog behind "Permissions"). Django enforces every
 * key again on the endpoint behind this screen — the buttons here only decide
 * what is offered to the signed-in administrator.
 */
export default function DepartmentsPage() {
  const { can } = useAuth()
  const departments = useFetch('/departments/', { list: true })
  const definitions = useFetch('/permissions/', { list: true })

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [matrixFor, setMatrixFor] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [notice, setNotice] = useState(null)
  const [actionError, setActionError] = useState(null)

  const rows = departments.data || []
  const canManage = can('departments.manage')

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(department) {
    setEditing(department)
    setModalOpen(true)
  }

  /** Activate/deactivate a department — deactivation stops its grants. */
  async function toggleActive(department) {
    const next = !department.is_active
    const verb = next ? 'Activate' : 'Deactivate'
    // eslint-disable-next-line no-alert
    if (!window.confirm(`${verb} ${department.name}?`)) return
    setBusyId(department.id)
    setActionError(null)
    try {
      await api.patch(`/departments/${department.id}/`, { is_active: next })
      setNotice(
        next
          ? `${department.name} is active again.`
          : `${department.name} was deactivated — its administrators no longer hold its permissions.`
      )
      departments.reload()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  /** Departments with assigned administrators must be reassigned first. */
  async function remove(department) {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete ${department.name}? This cannot be undone.`)) return
    setBusyId(department.id)
    setActionError(null)
    try {
      await api.delete(`/departments/${department.id}/`)
      setNotice(`${department.name} was deleted.`)
      departments.reload()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Departments & Roles"
        subtitle="Which administrators belong where, and exactly what each department may do."
        actions={
          <div className="row row-wrap" style={{ gap: 10 }}>
            <span className="badge badge-blue">
              {rows.length} {rows.length === 1 ? 'department' : 'departments'}
            </span>
            {canManage && (
              <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
                <Icon name="userPlus" size={15} />
                Add department
              </button>
            )}
          </div>
        }
      />

      {notice && (
        <div className="alert alert-success" role="status">
          <Icon name="check" size={17} />
          <span className="grow">{notice}</span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      {actionError && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={17} />
          <span className="grow">{actionError}</span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setActionError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <section className="card">
        {departments.loading && !departments.data && (
          <TableSkeleton
            headers={['Department', 'Code', 'Administrators', 'Permissions', 'Status', 'Actions']}
            rows={6}
            label="Loading departments…"
          />
        )}

        {!departments.loading && departments.error && (
          <div className="card-body">
            <ErrorMessage
              error={departments.error}
              title="Could not load departments"
              onRetry={departments.reload}
            />
          </div>
        )}

        {!departments.loading && !departments.error && rows.length === 0 && (
          <div className="card-body">
            <EmptyState
              icon="shield"
              title="No departments yet"
              message="Create the first department, then grant it permissions from its matrix."
            />
          </div>
        )}

        {!departments.loading && !departments.error && rows.length > 0 && (
          <div className="table-wrap">
            <table className="table responsive-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Code</th>
                  <th>Administrators</th>
                  <th>Permissions</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((department) => (
                  <tr key={department.id}>
                    <td data-label="Department" className="cell-main">
                      {department.name}
                      {department.description && (
                        <span className="subtle" style={{ display: 'block', fontWeight: 400 }}>
                          {department.description}
                        </span>
                      )}
                    </td>
                    <td data-label="Code">{department.code}</td>
                    <td data-label="Administrators">{department.administrator_count}</td>
                    <td data-label="Permissions">{department.permission_count}</td>
                    <td data-label="Status">
                      <StatusBadge
                        label={department.is_active ? 'Active' : 'Inactive'}
                        tone={department.is_active ? 'green' : 'red'}
                      />
                    </td>
                    <td data-label="Actions">
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => setMatrixFor(department)}
                          disabled={busyId === department.id}
                        >
                          <Icon name="shield" size={14} />
                          Permissions
                        </button>
                        {canManage && (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              onClick={() => openEdit(department)}
                              disabled={busyId === department.id}
                            >
                              <Icon name="pencil" size={14} />
                              Edit
                            </button>
                            <button
                              type="button"
                              className={`btn btn-sm ${department.is_active ? 'btn-danger' : 'btn-secondary'}`}
                              onClick={() => toggleActive(department)}
                              disabled={busyId === department.id}
                            >
                              {busyId === department.id ? (
                                <ButtonLoader />
                              ) : (
                                <Icon name={department.is_active ? 'shield' : 'check'} size={14} />
                              )}
                              {department.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              onClick={() => remove(department)}
                              disabled={busyId === department.id}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="subtle">
        Deactivating a department is the safe way to retire it: its
        administrators keep their accounts but immediately lose the
        permissions it granted. Departments with administrators assigned
        cannot be deleted — reassign those administrators first.
      </p>

      <DepartmentFormModal
        key={modalOpen ? (editing ? `edit-${editing.id}` : 'create') : 'closed'}
        open={modalOpen}
        department={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setNotice('Department saved.')
          departments.reload()
        }}
      />

      <PermissionMatrixModal
        key={matrixFor ? `matrix-${matrixFor.id}` : 'matrix-closed'}
        open={Boolean(matrixFor)}
        department={matrixFor}
        definitions={definitions.data || []}
        onClose={() => setMatrixFor(null)}
        onSaved={() => {
          setNotice('Permissions saved.')
          departments.reload()
        }}
      />
    </div>
  )
}
