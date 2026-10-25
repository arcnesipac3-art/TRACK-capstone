import { useState } from 'react'
import ChildSelector from '../components/ChildSelector'
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

export default function RequirementsPage({ scope }) {
  const copy = COPY[scope] || COPY.student
  const summary = useFetch('/dashboard/', { enabled: scope === 'parent' })
  const [selectedId, setSelectedId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const children = summary.data?.children || []
  const activeChild =
    children.find((child) => child.student_id === selectedId) || children[0] || null

  const canCreate = scope === 'teacher'

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
    return <div className="skeleton skeleton-block" aria-hidden="true" />
  }

  if (scope === 'parent' && children.length === 0) {
    return (
      <div className="stack stack-md">
        <PageHeader title={copy.title} subtitle={copy.subtitle} />
        <section className="card card-pad">
          <EmptyState
            icon="users"
            title="No linked children"
            message="Your account is not connected to a student record yet."
          />
        </section>
      </div>
    )
  }

  const params =
    scope === 'parent' && activeChild ? { child: activeChild.student_id } : {}

  return (
    <div className="stack stack-md">
      <PageHeader
        title={copy.title}
        subtitle={
          scope === 'parent' && activeChild
            ? `${copy.subtitle} Showing ${activeChild.name}.`
            : copy.subtitle
        }
        actions={
          canCreate ? (
            <RequirementCreateForm onCreated={() => setRefreshKey((k) => k + 1)} />
          ) : null
        }
      />

      {scope === 'parent' && (
        <ChildSelector
          items={children}
          selectedId={activeChild?.student_id}
          onSelect={setSelectedId}
        />
      )}

      <section className="card card-pad">
        <RequirementsExplorer
          scope={scope}
          params={params}
          showFilter
          refreshKey={refreshKey}
        />
      </section>
    </div>
  )
}
