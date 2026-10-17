import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import LoadingSpinner from '../components/LoadingSpinner'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import Card from '../components/dashboard/Card'
import useFetch from '../hooks/useFetch'

export default function TeacherClassesPage() {
  const assignments = useFetch('/teacher-assignments/', { list: true })
  const requirements = useFetch('/requirements/', { list: true })
  const students = useFetch('/students/', { list: true })

  const classes = assignments.data || []
  const requirementsBySection = new Map()
  ;(requirements.data || []).forEach((requirement) => {
    const key = requirement.section_name
    requirementsBySection.set(key, (requirementsBySection.get(key) || 0) + 1)
  })

  const studentsBySection = new Map()
  ;(students.data || []).forEach((student) => {
    const key = student.section_name
    if (key) studentsBySection.set(key, (studentsBySection.get(key) || 0) + 1)
  })

  const loading = assignments.loading && !assignments.data
  const error = assignments.error

  return (
    <div className="stack stack-md">
      <PageHeader
        title="My Classes"
        subtitle="The subjects and sections assigned to you this school year."
        actions={
          <span className="badge badge-blue">
            {classes.length} {classes.length === 1 ? 'assignment' : 'assignments'}
          </span>
        }
      />

      <div className="grid grid-3">
        <StatCard label="Assignments" value={classes.length} hint="Subject-section pairs" />
        <StatCard
          label="Requirements posted"
          value={(requirements.data || []).length}
          hint="Across your classes"
        />
        <StatCard
          label="Students"
          value={(students.data || []).length}
          hint="In your assigned sections"
        />
      </div>

      <section className="card">
        {loading && <LoadingSpinner block label="Loading your classes…" />}

        {!loading && error && (
          <div className="card-body">
            <ErrorMessage error={error} title="Could not load classes" onRetry={assignments.reload} />
          </div>
        )}

        {!loading && !error && classes.length === 0 && (
          <div className="card-body">
            <EmptyState
              icon="book"
              title="No classes assigned"
              message="Ask the school administrator to assign your subjects and sections."
            />
          </div>
        )}

        {!loading && !error && classes.length > 0 && (
          <div className="table-wrap">
            <table className="table responsive-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Section</th>
                  <th>Students</th>
                  <th>Requirements</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Subject" className="cell-main">
                      {item.subject_name}
                    </td>
                    <td data-label="Section">{item.section_name}</td>
                    <td data-label="Students">
                      {studentsBySection.get(item.section_name) ?? '—'}
                    </td>
                    <td data-label="Requirements">
                      {requirementsBySection.get(item.section_name) ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Card title="Where to go next">
        <p className="muted" style={{ fontSize: '0.9rem' }}>
          Post work from <strong>Requirements</strong>, check what students
          send from <strong>Submission Review</strong>, and record who attended
          from <strong>Attendance</strong>.
        </p>
      </Card>
    </div>
  )
}
