import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ChildSelector from '../components/ChildSelector'
import Card from '../components/dashboard/Card'
import CardSkeleton from '../components/loading/CardSkeleton'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import PageHeader from '../components/PageHeader'
import RequirementCreateForm from '../components/requirements/RequirementCreateForm'
import RequirementsExplorer from '../components/requirements/RequirementsExplorer'
import useFetch from '../hooks/useFetch'

const COPY = {
  student: {
    title: 'My Requirements',
    subtitle: 'Everything assigned to your section, with deadlines and status.',
  },
  parent: {
    title: 'Requirements',
    subtitle: 'Assignments for your selected child, updated by their teachers.',
  },
  teacher: {
    title: 'Requirements',
    subtitle: 'Requirements you posted to your classes.',
  },
  admin: {
    title: 'Requirements',
    subtitle: 'All requirements currently on record across the school.',
  },
}

export default function RequirementsPage({ scope, assignmentId = null, embedded = false }) {
  const copy = COPY[scope] || COPY.student
  const [searchParams] = useSearchParams()
  const summary = useFetch('/dashboard/', { enabled: scope === 'parent' })
  const [selectedId, setSelectedId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const children = summary.data?.children || []
  const activeChild =
    children.find((child) => child.student_id === selectedId) || children[0] || null

  const canCreate = scope === 'teacher'
  // A class workspace hands the assignment in as a prop; the standalone screen
  // is still reached with `?class=` from a dashboard shortcut or a bookmark.
  const classScope = assignmentId ?? searchParams.get('class')

  if (scope === 'parent' && summary.error) {
    return (
      <ErrorMessage
        error={summary.error}
        title="Could not load your children"
        onRetry={summary.reload}
      />
    )
  }

  if (scope === 'parent' && summary.loading && !summary.data) {
    return (
      <div className="stack stack-md">
        <PageHeader title={copy.title} subtitle={copy.subtitle} />
        <CardSkeleton lines={0} blockHeight={260} label="Loading your children…" />
      </div>
    )
  }

  if (scope === 'parent' && children.length === 0) {
    return (
      <div className="stack stack-md">
        <PageHeader title={copy.title} subtitle={copy.subtitle} />
        <Card
          empty={
            <EmptyState
              icon="users"
              title="No linked children"
              message="Your account is not connected to a student record yet."
            />
          }
        />
      </div>
    )
  }

  const params =
    scope === 'parent' && activeChild ? { child: activeChild.student_id } : {}

  return (
    <div className={`stack ${embedded ? 'stack-sm' : 'stack-md'}`}>
      {!embedded && (
        <PageHeader
          title={copy.title}
          subtitle={
            scope === 'parent' && activeChild
              ? `${copy.subtitle} Showing ${activeChild.name}.`
              : copy.subtitle
          }
          actions={
            canCreate ? (
              <RequirementCreateForm
                initialAssignment={classScope}
                onCreated={() => setRefreshKey((k) => k + 1)}
              />
            ) : null
          }
        />
      )}

      {embedded && canCreate && (
        <div className="cw-activity-bar">
          <span className="cw-activity-note">
            {copy.subtitle} Only this class is listed; the class header names it
            above.
          </span>
          <RequirementCreateForm
            initialAssignment={classScope}
            onCreated={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      )}

      {scope === 'parent' && (
        <ChildSelector
          items={children}
          selectedId={activeChild?.student_id}
          onSelect={setSelectedId}
        />
      )}

      <Card>
        <RequirementsExplorer
          scope={scope}
          params={params}
          showFilter
          refreshKey={refreshKey}
          classScope={classScope}
          locked={Boolean(assignmentId)}
        />
      </Card>
    </div>
  )
}
