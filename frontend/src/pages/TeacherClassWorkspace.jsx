import { lazy, Suspense } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import Icon from '../components/Icon'
import StatusBadge from '../components/StatusBadge'
import Tabs from '../components/Tabs'
import CardSkeleton from '../components/loading/CardSkeleton'
import StatCardSkeleton from '../components/loading/StatCardSkeleton'
import ClassGrades from '../components/classes/ClassGrades'
import ClassOverview from '../components/classes/ClassOverview'
import ClassStudents from '../components/classes/ClassStudents'
import useClassData from '../hooks/useClassData'
import { CLASS_ACTIVITIES } from '../config/navigation'
import { formatCount } from '../utils/format'
import './TeacherClassWorkspace.css'

// The three modules that already exist are reused as the body of their own
// class activity, with the class id handed over as a prop so they scope
// themselves to this assignment instead of every class the teacher has.
const RequirementsPage = lazy(() => import('./RequirementsPage'))
const SubmissionsPage = lazy(() => import('./SubmissionsPage'))
const AttendancePage = lazy(() => import('./AttendancePage'))

const ACTIVITIES = ['overview', 'students', 'requirements', 'submissions', 'attendance', 'grades']

const TAB_ICONS = {
  overview: 'grid',
  students: 'users',
  requirements: 'clipboard',
  submissions: 'checkSquare',
  attendance: 'calendar',
  grades: 'chart',
}

/** "Grade 7 — Gumamela", the same reading the hub uses. */
function sectionLine(row) {
  if (row.gradeLevelName && row.sectionName) {
    return `${row.gradeLevelName} — ${row.sectionName}`
  }
  return row.sectionLabel || 'Unassigned section'
}

function tabLabel(id, board) {
  const label = CLASS_ACTIVITIES[id]
  if (!board) return label
  const counts = {
    students: board.row.studentCount,
    requirements: board.row.requirementCount,
    submissions: board.indicators.pending,
    attendance: board.indicators.sessionsNeedingMarks,
    grades: board.indicators.missingWork,
  }
  const count = counts[id]
  if (!count) return label
  return (
    <>
      {label}
      <span className={`tab-count${id === 'submissions' || id === 'attendance' ? ' is-alert' : ''}`}>
        {count}
      </span>
    </>
  )
}

export default function TeacherClassWorkspace() {
  // One route record (`/teacher/classes/:assignmentId/*`) so switching
  // activity never remounts the page or refetches the class: the splat is the
  // activity slug, empty for the overview.
  const params = useParams()
  const assignmentId = params.assignmentId
  const activity = (params['*'] || '').split('/')[0]
  const navigate = useNavigate()
  const {
    board,
    rows,
    totals,
    busy,
    loading,
    error,
    partialErrors,
    activeSchoolYear,
    reload,
  } = useClassData({ withSchedules: true, assignmentId })

  if (error) {
    return (
      <div className="class-workspace stack stack-md">
        <EmptyTrail assignmentId={assignmentId} />
        <ErrorMessage error={error} title="Could not load this class" onRetry={reload} />
      </div>
    )
  }

  if (!board) {
    if (busy || loading) {
      return (
        <div className="class-workspace stack stack-md">
          <span className="sr-only" role="status">
            Loading this class…
          </span>
          <CardSkeleton lines={2} className="cw-hero-skeleton" />
          <div className="kpi-grid" aria-hidden="true">
            {[0, 1, 2, 3].map((key) => (
              <StatCardSkeleton key={key} />
            ))}
          </div>
          <CardSkeleton lines={5} />
        </div>
      )
    }
    return (
      <div className="class-workspace stack stack-md">
        <EmptyTrail assignmentId={assignmentId} />
        <section className="card">
          <div className="card-body">
            <EmptyState
              icon="book"
              title="This class is not yours to open"
              message={
                rows.length === 0
                  ? 'No subject and section is assigned to your account yet, so there is no class workspace to open. An administrator assigns one on Class Assignments.'
                  : `Assignment ${assignmentId} is not among the ${
                      rows.length === 1 ? '1 class' : `${rows.length} classes`
                    } this account can reach. A class opens from My Classes, and only the assignment ids on your own list resolve here.`
              }
              action={
                <Link className="btn btn-primary btn-sm" to="/teacher/classes">
                  <Icon name="arrowLeft" size={14} />
                  Back to My Classes
                </Link>
              }
            />
          </div>
        </section>
      </div>
    )
  }

  if (activity !== '' && !ACTIVITIES.includes(activity)) {
    // A mistyped activity has no screen to show; send the teacher back to the
    // one that always exists instead of rendering an empty frame.
    return <Navigate to={`/teacher/classes/${board.row.id}`} replace />
  }
  const currentActivity = activity === '' ? 'overview' : activity

  return (
    <div className="class-workspace stack stack-md">
      <WorkspaceHeader board={board} totals={totals} activeSchoolYear={activeSchoolYear} />

      <ActivityTabs
        board={board}
        activity={currentActivity}
        onNavigate={(id) =>
          navigate(`/teacher/classes/${board.row.id}${id === 'overview' ? '' : `/${id}`}`)
        }
      />

      {partialErrors.length > 0 && (
        <ErrorMessage
          compact
          error="Some of this class’s data did not load, so the counts on this page may be lower than they should be."
          onRetry={reload}
        />
      )}

      <div
        role="tabpanel"
        id={`cw-panel-${currentActivity}`}
        aria-labelledby={`cw-tab-${currentActivity}`}
        className="stack stack-md"
      >
        <Suspense
          fallback={<CardSkeleton lines={4} label={`Loading ${CLASS_ACTIVITIES[currentActivity]}…`} />}
        >
          {currentActivity === 'overview' && <ClassOverview board={board} />}
          {currentActivity === 'students' && <ClassStudents board={board} />}
          {currentActivity === 'grades' && <ClassGrades board={board} />}
          {currentActivity === 'requirements' && (
            <RequirementsPage scope="teacher" assignmentId={board.row.id} embedded />
          )}
          {currentActivity === 'submissions' && (
            <SubmissionsPage
              mode="review"
              assignmentId={board.row.id}
              // Sorted so the queue the module builds from these ids does not
              // reshuffle when the class lists reload in another order.
              requirementIds={board.requirements
                .map((requirement) => requirement.id)
                .sort((a, b) => a - b)}
              embedded
            />
          )}
          {currentActivity === 'attendance' && (
            <AttendancePage mode="teacher" assignmentId={board.row.id} embedded />
          )}
        </Suspense>
      </div>
    </div>
  )
}

function EmptyTrail({ assignmentId }) {
  return (
    <nav className="cw-trail" aria-label="Class trail">
      <ol>
        <li>
          <Link to="/teacher/classes">My Classes</Link>
        </li>
        <li aria-current="page">Class {assignmentId}</li>
      </ol>
    </nav>
  )
}

/**
 * The class itself, always on screen above the activity: which subject, which
 * section, which school year, and the other subjects taught to the same room
 * so a teacher can hop between them without going back to the hub.
 */
function WorkspaceHeader({ board, totals, activeSchoolYear }) {
  const { row, siblings } = board
  return (
    <header className="cw-hero">
      <nav className="cw-trail" aria-label="Class trail">
        <ol>
          <li>
            <Link to="/teacher/classes">My Classes</Link>
          </li>
          <li>
            <Link to={`/teacher/classes?search=${encodeURIComponent(sectionLine(row))}`}>
              {sectionLine(row)}
            </Link>
          </li>
          <li>
            <Link to={`/teacher/classes/${row.id}`}>{row.subjectName}</Link>
          </li>
        </ol>
      </nav>

      <div className="cw-hero-main">
        <h1 className="cw-title">{row.subjectName}</h1>
        <p className="cw-subtitle">
          {sectionLine(row)}
          {row.schoolYearLabel ? ` · SY ${row.schoolYearLabel}` : ' · School year not set'}
          {row.adviserName ? ` · Adviser ${row.adviserName}` : ''}
          {` · ${formatCount(row.studentCount, 'student')}`}
        </p>
      </div>

      <div className="cw-hero-side">
        <StatusBadge label={row.status.label} tone={row.status.tone} />
        {activeSchoolYear && row.schoolYearId === activeSchoolYear.id && (
          <span className="cw-year is-current">
            <Icon name="calendar" size={14} />
            Current school year
          </span>
        )}
        {activeSchoolYear && row.schoolYearId !== activeSchoolYear.id && (
          <span className="cw-year">
            <Icon name="calendar" size={14} />
            Outside the active SY {activeSchoolYear.label}
          </span>
        )}
        {totals.pending > 0 && (
          <Link className="btn btn-ghost btn-sm" to="/teacher/review">
            <Icon name="inbox" size={14} />
            {formatCount(totals.pending, 'submission')} across all your classes
          </Link>
        )}
      </div>

      {siblings.length > 0 && (
        <nav className="cw-siblings" aria-label="Other subjects in this section">
          <span className="cw-siblings-label">Also teach here</span>
          {siblings.map((sibling) => (
            <Link
              key={sibling.id}
              className="cw-sibling"
              to={`/teacher/classes/${sibling.id}`}
              aria-label={`Open ${sibling.subjectName} for ${sectionLine(sibling)}`}
            >
              {sibling.subjectName}
              {sibling.pendingCount > 0 && (
                <span className="cw-sibling-count">{sibling.pendingCount}</span>
              )}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}

function ActivityTabs({ board, activity, onNavigate }) {
  return (
    <Tabs
      idPrefix="cw"
      label={`${board.row.subjectName} class activities`}
      value={activity}
      onChange={(id) => onNavigate(id)}
      tabs={ACTIVITIES.map((id) => ({
        id,
        label: (
          <>
            <Icon name={TAB_ICONS[id]} size={14} />
            {tabLabel(id, board)}
          </>
        ),
      }))}
    />
  )
}
