import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import ListSkeleton from '../components/loading/ListSkeleton'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import Card from '../components/dashboard/Card'
import useFetch from '../hooks/useFetch'

export default function ParentChildrenPage() {
  const summary = useFetch('/dashboard/')
  const profiles = useFetch('/students/', { list: true })

  const children = summary.data?.children || []
  const profilesById = new Map(
    (profiles.data || []).map((profile) => [profile.id, profile])
  )

  if (summary.loading && !summary.data) {
    return (
      <section className="card">
        <ListSkeleton items={3} lines={2} avatar label="Loading your children…" />
      </section>
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

  return (
    <div className="stack stack-md">
      <PageHeader
        title="My Children"
        subtitle="Student records linked to your parent account."
      />

      {children.length === 0 ? (
        <section className="card card-pad">
          <EmptyState
            icon="users"
            title="No linked children"
            message="Your account is not connected to any student record. Please coordinate with the school registrar."
          />
        </section>
      ) : (
        <div className="grid grid-2">
          {children.map((child) => {
            const profile = profilesById.get(child.student_id)
            const attendance = child.attendance
            return (
              <section className="card card-pad stack stack-sm" key={child.student_id}>
                <div className="row row-between row-wrap">
                  <div>
                    <h2>{child.name}</h2>
                    <p className="subtle">{child.section || 'No section assigned'}</p>
                  </div>
                  <StatusBadge
                    label={
                      child.overdue > 0
                        ? `${child.overdue} overdue`
                        : 'On track'
                    }
                    tone={child.overdue > 0 ? 'red' : 'green'}
                  />
                </div>

                <dl className="profile-grid">
                  <div className="profile-field">
                    <dt>Learner reference no.</dt>
                    <dd>{profile?.lrn || '—'}</dd>
                  </div>
                  <div className="profile-field">
                    <dt>Requirements</dt>
                    <dd>{child.total_requirements}</dd>
                  </div>
                  <div className="profile-field">
                    <dt>Verified</dt>
                    <dd>{child.verified}</dd>
                  </div>
                  <div className="profile-field">
                    <dt>Attendance</dt>
                    <dd>
                      {attendance && attendance.total_records > 0
                        ? `${attendance.present_rate}% present (${attendance.total_records} records)`
                        : 'No records yet'}
                    </dd>
                  </div>
                </dl>
              </section>
            )
          })}
        </div>
      )}

      <Card title="Privacy">
        <p className="muted" style={{ fontSize: '0.9rem' }}>
          Your account can only open the records of children linked to you in
          the school system — this is enforced by the server, not by this page.
        </p>
      </Card>
    </div>
  )
}
