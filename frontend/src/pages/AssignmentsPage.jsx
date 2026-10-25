import { useState } from 'react'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import Card from '../components/dashboard/Card'
import AssignmentFormModal from '../components/admin/AssignmentFormModal'
import api from '../services/api'
import useFetch from '../hooks/useFetch'

/**
 * Admin: manage which teacher teaches which subject in which section.
 *
 * This is the record that unlocks a teacher's ability to post requirements and
 * take attendance, so it is surfaced as its own screen rather than buried.
 */
export default function AssignmentsPage() {
  const assignments = useFetch('/teacher-assignments/', { list: true })
  const teachers = useFetch('/users/', { list: true, params: { role: 'teacher' } })
  const sections = useFetch('/sections/', { list: true })
  const subjects = useFetch('/subjects/', { list: true })

  const [modal, setModal] = useState(null) // { item }
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)

  const rows = assignments.data || []

  /** Removing an assignment revokes that teacher's access to the class. */
  async function remove(row) {
    const label = `${row.teacher_name} — ${row.subject_name}`
    // eslint-disable-next-line no-alert
    if (
      !window.confirm(
        `Remove ${label} from ${row.section_name}?\n\nThe teacher will no longer be able to post requirements or take attendance for this class. Existing records are kept.`
      )
    ) {
      return
    }
    setBusyId(row.id)
    setActionError(null)
    try {
      await api.delete(`/teacher-assignments/${row.id}/`)
      assignments.reload()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Class Assignments"
        subtitle="Which teacher teaches which subject in which section."
        actions={
          <div className="row row-wrap" style={{ gap: 10 }}>
            <span className="badge badge-blue">
              {rows.length} {rows.length === 1 ? 'assignment' : 'assignments'}
            </span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setModal({ item: null })}
            >
              <Icon name="plus" size={15} />
              Assign a class
            </button>
          </div>
        }
      />

      {actionError && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={17} />
          <span className="grow">{actionError}</span>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => setActionError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <Card
        title="Assignments"
        loading={assignments.loading && !assignments.data}
        error={assignments.error}
        onRetry={assignments.reload}
        action={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setModal({ item: null })}
          >
            <Icon name="plus" size={15} />
            Assign a class
          </button>
        }
        empty={
          !assignments.loading && rows.length === 0 ? (
            <EmptyState
              icon="book"
              title="No class assignments yet"
              message="Assign a teacher to a subject and section so they can post requirements and take attendance."
            />
          ) : null
        }
        flush
      >
        <div className="table-wrap">
          <table className="table responsive-table">
            <thead>
              <tr>
                <th>Teacher</th>
                <th>Subject</th>
                <th>Section</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td data-label="Teacher" className="cell-main">
                    {row.teacher_name || `Teacher #${row.teacher}`}
                  </td>
                  <td data-label="Subject">{row.subject_name}</td>
                  <td data-label="Section">{row.section_name}</td>
                  <td data-label="Actions">
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => setModal({ item: row })}
                        disabled={busyId === row.id}
                      >
                        <Icon name="pencil" size={14} />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => remove(row)}
                        disabled={busyId === row.id}
                      >
                        {busyId === row.id ? (
                          <span className="spinner spinner-sm" aria-hidden="true" />
                        ) : (
                          <Icon name="trash" size={14} />
                        )}
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="subtle">
        A teacher needs at least one assignment before their dashboard shows any
        classes. Removing an assignment does not delete the requirements or
        attendance already recorded for that class.
      </p>

      <AssignmentFormModal
        key={modal ? (modal.item ? `edit-${modal.item.id}` : 'create') : 'closed'}
        open={Boolean(modal)}
        item={modal?.item}
        teachers={teachers.data || []}
        sections={sections.data || []}
        subjects={subjects.data || []}
        onClose={() => setModal(null)}
        onSaved={() => assignments.reload()}
      />
    </div>
  )
}
