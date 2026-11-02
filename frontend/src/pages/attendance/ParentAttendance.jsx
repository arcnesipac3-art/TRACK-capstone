import { useState } from 'react'
import Card from '../../components/dashboard/Card'
import ChildSelector from '../../components/ChildSelector'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import TableSkeleton from '../../components/loading/TableSkeleton'
import useFetch from '../../hooks/useFetch'
import RecordsTable from './RecordsTable'

/**
 * A parent's view: choose the child, then read that child's records.
 *
 * The selector is the only thing a parent controls here. Which child is being
 * read travels to the server as a filter, and the backend decides what a parent
 * may see — the screen never assumes the list of children it was given is an
 * authorisation.
 */
export default function ParentAttendance() {
  const summary = useFetch('/dashboard/')
  const [selectedId, setSelectedId] = useState(null)
  const children = summary.data?.children || []
  const activeChild =
    children.find((child) => child.student_id === selectedId) || children[0] || null

  if (summary.loading && !summary.data) {
    // The parent view is a child-selector pill strip above a records table, so
    // mirror both. `ChildSelector` only renders for 2+ children, so for a
    // single-child parent this strip collapses once — the only unavoidable
    // guess, since the count is exactly what is still loading.
    return (
      <div className="stack stack-md">
        <div role="status" aria-live="polite" className="sr-only">
          Loading your children…
        </div>
        <div className="child-selector" aria-hidden="true">
          {[110, 132, 96].map((width) => (
            <span key={width} className="skeleton" style={{ width }} />
          ))}
        </div>
        <Card>
          <TableSkeleton headers={['Date', 'Class', 'Subject', 'Status', 'Notes']} rows={5} />
        </Card>
      </div>
    )
  }

  if (summary.error) {
    return (
      <ErrorMessage
        error={summary.error}
        title="Could not load your children"
        onRetry={summary.reload}
      />
    )
  }

  if (children.length === 0) {
    return (
      <Card
        empty={
          <EmptyState
            icon="users"
            title="No linked children"
            message="Your account is not connected to a student record yet."
          />
        }
      />
    )
  }

  return (
    <div className="stack stack-md">
      <ChildSelector items={children} selectedId={activeChild?.student_id} onSelect={setSelectedId} />
      <RecordsTable
        key={activeChild?.student_id}
        studentId={activeChild?.student_id ?? null}
      />
    </div>
  )
}
