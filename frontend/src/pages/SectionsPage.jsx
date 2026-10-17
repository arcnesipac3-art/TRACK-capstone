import { useState } from 'react'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import Card from '../components/dashboard/Card'
import StructureFormModal from '../components/admin/StructureFormModal'
import { endpointFor } from '../config/structure'
import api from '../services/api'
import useFetch from '../hooks/useFetch'
import { formatDate } from '../utils/format'

/**
 * Delete copy per kind. The consequence differs a lot — removing a school year
 * would cascade the year's whole academic record, so it gets the strongest
 * warning — and every refusal from the server is surfaced verbatim.
 */
const CONFIRM = {
  section: (item) =>
    `Delete section ${item.name}?\n\nThis cannot be undone. The server will refuse if students are still enrolled or a teacher is still assigned.`,
  subject: (item) =>
    `Delete subject ${item.name}?\n\nThis cannot be undone. The server will refuse if a teacher is still assigned to it.`,
  schoolYear: (item) =>
    `Delete school year ${item.label}?\n\nThis cannot be undone, and it will also delete every section and subject in it — which removes the class assignments, requirements, submissions and attendance records tied to those sections.\n\nThe server will refuse while any section or subject still belongs to this year.${
      item.is_active
        ? '\n\nThis is the current school year. Deleting it leaves no current year until you mark another one.'
        : ''
    }`,
  gradeLevel: (item) =>
    `Delete ${item.name}?\n\nThis cannot be undone. The server will refuse while any section or subject still uses this grade level.`,
}

export default function SectionsPage() {
  const sections = useFetch('/sections/', { list: true })
  const subjects = useFetch('/subjects/', { list: true })
  const gradeLevels = useFetch('/grade-levels/', { list: true })
  const schoolYears = useFetch('/school-years/', { list: true })
  const teachers = useFetch('/users/', { list: true, params: { role: 'teacher' } })

  const [modal, setModal] = useState(null) // { kind, item }
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)

  const options = {
    gradeLevels: gradeLevels.data || [],
    schoolYears: schoolYears.data || [],
    teachers: teachers.data || [],
  }

  /** Reload the collection a kind belongs to. */
  const RELOAD = {
    section: sections.reload,
    subject: subjects.reload,
    schoolYear: schoolYears.reload,
    gradeLevel: gradeLevels.reload,
  }

  function close() {
    setModal(null)
  }

  /**
   * Delete any of the four record types. Django refuses when the record is
   * still in use and returns a readable message, which we surface here rather
   * than swallowing.
   */
  async function remove(kind, item) {
    // eslint-disable-next-line no-alert
    if (!window.confirm(CONFIRM[kind](item))) return

    setBusyId(`${kind}-${item.id}`)
    setActionError(null)
    try {
      await api.delete(`/${endpointFor(kind)}/${item.id}/`)
      RELOAD[kind]?.()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  /** Shared Edit + Delete cell, so all four tables behave identically. */
  function actions(kind, item) {
    const id = `${kind}-${item.id}`
    const name = item.name || item.label
    return (
      <div className="row-actions">
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          aria-label={`Edit ${name}`}
          onClick={() => setModal({ kind, item })}
        >
          <Icon name="pencil" size={14} />
          Edit
        </button>
        <button
          type="button"
          className="btn btn-sm btn-danger"
          aria-label={`Delete ${name}`}
          onClick={() => remove(kind, item)}
          disabled={busyId === id}
        >
          {busyId === id ? (
            <span className="spinner spinner-sm" aria-hidden="true" />
          ) : (
            <Icon name="trash" size={14} />
          )}
          Delete
        </button>
      </div>
    )
  }

  return (
    <div className="stack stack-md">
      <PageHeader
        title="School Structure"
        subtitle="The school years, grade levels, sections and subjects everything else is built on."
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

      {/* ── School years ──────────────────────────────────────────────── */}
      <Card
        title="School years"
        loading={schoolYears.loading && !schoolYears.data}
        error={schoolYears.error}
        onRetry={schoolYears.reload}
        action={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setModal({ kind: 'schoolYear', item: null })}
          >
            <Icon name="plus" size={15} />
            Add school year
          </button>
        }
        empty={
          !schoolYears.loading && (schoolYears.data || []).length === 0 ? (
            <EmptyState
              icon="calendar"
              title="No school years"
              message="Add the first school year, e.g. 2026-2027."
            />
          ) : null
        }
        flush
      >
        <div className="table-wrap">
          <table className="table responsive-table">
            <thead>
              <tr>
                <th>School year</th>
                <th>Dates</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(schoolYears.data || []).map((year) => (
                <tr key={year.id}>
                  <td data-label="School year" className="cell-main">
                    {year.label}
                  </td>
                  <td data-label="Dates">
                    {formatDate(year.start_date)} – {formatDate(year.end_date)}
                  </td>
                  <td data-label="Status">
                    {year.is_active ? (
                      <StatusBadge label="Current" tone="green" />
                    ) : (
                      <StatusBadge label="Not current" tone="neutral" />
                    )}
                  </td>
                  <td data-label="Actions">{actions('schoolYear', year)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Grade levels ──────────────────────────────────────────────── */}
      <Card
        title="Grade levels"
        loading={gradeLevels.loading && !gradeLevels.data}
        error={gradeLevels.error}
        onRetry={gradeLevels.reload}
        action={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setModal({ kind: 'gradeLevel', item: null })}
          >
            <Icon name="plus" size={15} />
            Add grade level
          </button>
        }
        empty={
          !gradeLevels.loading && (gradeLevels.data || []).length === 0 ? (
            <EmptyState
              icon="layers"
              title="No grade levels"
              message="Add the first grade level, e.g. Grade 7."
            />
          ) : null
        }
        flush
      >
        <div className="table-wrap">
          <table className="table responsive-table">
            <thead>
              <tr>
                <th>Grade level</th>
                <th>Sort order</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(gradeLevels.data || []).map((grade) => (
                <tr key={grade.id}>
                  <td data-label="Grade level" className="cell-main">
                    {grade.name}
                  </td>
                  <td data-label="Sort order">{grade.order}</td>
                  <td data-label="Actions">{actions('gradeLevel', grade)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Sections ──────────────────────────────────────────────────── */}
      <Card
        title="Sections"
        loading={sections.loading && !sections.data}
        error={sections.error}
        onRetry={sections.reload}
        action={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setModal({ kind: 'section', item: null })}
          >
            <Icon name="plus" size={15} />
            Add section
          </button>
        }
        empty={
          !sections.loading && (sections.data || []).length === 0 ? (
            <EmptyState
              icon="layers"
              title="No sections"
              message="Add the first section for this school year."
            />
          ) : null
        }
        flush
      >
        <div className="table-wrap">
          <table className="table responsive-table">
            <thead>
              <tr>
                <th>Section</th>
                <th>Grade level</th>
                <th>School year</th>
                <th>Adviser</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(sections.data || []).map((section) => (
                <tr key={section.id}>
                  <td data-label="Section" className="cell-main">
                    {section.name}
                  </td>
                  <td data-label="Grade level">{section.grade_level_name}</td>
                  <td data-label="School year">{section.school_year_label}</td>
                  <td data-label="Adviser">
                    {section.adviser_name || <span className="subtle">None assigned</span>}
                  </td>
                  <td data-label="Actions">{actions('section', section)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Subjects ──────────────────────────────────────────────────── */}
      <Card
        title="Subjects"
        loading={subjects.loading && !subjects.data}
        error={subjects.error}
        onRetry={subjects.reload}
        action={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setModal({ kind: 'subject', item: null })}
          >
            <Icon name="plus" size={15} />
            Add subject
          </button>
        }
        empty={
          !subjects.loading && (subjects.data || []).length === 0 ? (
            <EmptyState
              icon="book"
              title="No subjects"
              message="Add the first subject for this school year."
            />
          ) : null
        }
        flush
      >
        <div className="table-wrap">
          <table className="table responsive-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Code</th>
                <th>Grade level</th>
                <th>School year</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(subjects.data || []).map((subject) => (
                <tr key={subject.id}>
                  <td data-label="Subject" className="cell-main">
                    {subject.name}
                  </td>
                  <td data-label="Code">
                    {subject.code || <span className="subtle">—</span>}
                  </td>
                  <td data-label="Grade level">{subject.grade_level_name}</td>
                  <td data-label="School year">{subject.school_year_label}</td>
                  <td data-label="Actions">{actions('subject', subject)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="subtle">
        The server refuses to delete anything still in use — a section with
        students, a subject that is still taught, a grade level with sections,
        or a school year holding sections or subjects — and tells you what to
        move first. That matters most for a school year: deleting one would
        otherwise take every class assignment, requirement, submission and
        attendance record in it along with it.
      </p>

      <StructureFormModal
        key={modal ? `${modal.kind}-${modal.item?.id || 'new'}` : 'closed'}
        open={Boolean(modal)}
        kind={modal?.kind || 'section'}
        item={modal?.item}
        options={options}
        onClose={close}
        onSaved={() => modal && RELOAD[modal.kind]?.()}
      />
    </div>
  )
}
