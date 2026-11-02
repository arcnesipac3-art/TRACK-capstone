import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import CardSkeleton from '../components/loading/CardSkeleton'
import StatCardSkeleton from '../components/loading/StatCardSkeleton'
import QuickActions from '../components/dashboard/QuickActions'
import useClassData from '../hooks/useClassData'
import { useAuth } from '../context/AuthContext'
import { deadlineInfo, formatCount } from '../utils/format'
import {
  CLASS_STATUS,
  filterSectionGroups,
  gradeLevelsFromRows,
  greeting,
  schoolYearsFromRows,
  sortSectionGroups,
} from '../utils/classes'
import './TeacherClassesPage.css'

const STATUS_FILTERS = [
  { value: '', label: 'Any status' },
  ...Object.entries(CLASS_STATUS).map(([value, meta]) => ({
    value,
    label: meta.label,
  })),
]

const SORT_FILTERS = [
  { value: 'section', label: 'Class (grade, then section)' },
  { value: 'deadline', label: 'Next deadline' },
  { value: 'pending', label: 'Most awaiting review' },
  { value: 'students', label: 'Largest roster' },
  { value: 'subjects', label: 'Most subjects taught' },
]

const EMPTY_QUERY = {
  search: '',
  schoolYear: '',
  gradeLevel: '',
  status: '',
  sort: 'section',
}

/** "Grade 7 — Gumamela", falling back to the label the API already composed. */
function sectionLine(group) {
  if (group.gradeLevelName && group.sectionName) {
    return `${group.gradeLevelName} — ${group.sectionName}`
  }
  return group.sectionLabel || 'Unassigned section'
}

/** The one sentence the whole screen answers: what am I teaching right now? */
function overviewLine(totals, yearLabel) {
  if (totals.assignments === 0) {
    return 'No subject and section has been assigned to you yet.'
  }
  return [
    `You teach ${formatCount(totals.assignments, 'subject assignment')} across ` +
      `${totals.sections} ${totals.sections === 1 ? 'section' : 'sections'}` +
      (yearLabel ? ` in SY ${yearLabel}` : ''),
    `${formatCount(totals.students, 'student')} enrolled`,
    totals.pending > 0
      ? `${formatCount(totals.pending, 'submission')} awaiting verification`
      : null,
  ]
    .filter(Boolean)
    .join(' · ') + '.'
}

/** Deadlines and attendance across every subject taught in this room. */
function activitySummary(group) {
  const items = []
  if (group.nextDeadline) {
    const info = deadlineInfo(group.nextDeadline.deadline)
    items.push({
      icon: 'clock',
      tone: info.tone,
      text: `${group.nextDeadline.subjectName}: ${info.label} — ${group.nextDeadline.title}`,
    })
  }
  if (group.attendance.sessionCount > 0) {
    items.push({
      icon: 'calendar',
      tone: 'muted',
      text:
        group.attendance.presentRate === null
          ? `${formatCount(group.attendance.sessionCount, 'session')} recorded, no marks yet`
          : `${group.attendance.presentRate}% present across ${formatCount(
              group.attendance.sessionCount,
              'session'
            )}`,
    })
  }
  if (group.attendance.incomplete > 0) {
    items.push({
      icon: 'info',
      tone: 'amber',
      text: `${formatCount(group.attendance.incomplete, 'session')} still missing marks`,
    })
  }
  if (items.length === 0) {
    items.push({
      icon: 'plus',
      tone: 'muted',
      text: 'Nothing posted and no attendance recorded yet',
    })
  }
  return items
}

function SubjectRow({ row }) {
  return (
    <li className="subject-row">
      <span className="subject-name">{row.subjectName}</span>
      <span className="subject-counts">
        <span className="subtle">{formatCount(row.requirementCount, 'requirement')}</span>
        {row.pendingCount > 0 ? (
          <StatusBadge tone="amber" label={`${row.pendingCount} awaiting`} />
        ) : (
          <StatusBadge tone={row.status.tone} label={row.status.label} />
        )}
      </span>
      <Link
        className="btn btn-primary btn-sm subject-open"
        to={`/teacher/classes/${row.id}`}
        aria-label={`Open ${row.subjectName} for ${sectionLine({
          gradeLevelName: row.gradeLevelName,
          sectionName: row.sectionName,
          sectionLabel: row.sectionLabel,
        })}`}
      >
        Open class
        <Icon name="arrowRight" size={14} />
      </Link>
    </li>
  )
}

function SectionCard({ group, open, onToggle }) {
  const rosterId = `class-roster-${group.key}`
  // A room with one subject opens straight into it; several subjects need the
  // teacher to pick which class they mean.
  const single = group.subjects.length === 1 ? group.subjects[0] : null

  return (
    <article className={`class-card${open ? ' is-open' : ''}`}>
      <header className="class-card-head">
        <div className="grow">
          <h3 className="class-card-subject">{sectionLine(group)}</h3>
          <p className="class-card-class">
            {formatCount(group.subjectCount, 'subject')} ·{' '}
            {formatCount(group.studentCount, 'student')}
            {group.adviserName ? ` · Adviser ${group.adviserName}` : ''}
          </p>
        </div>
        <StatusBadge label={group.status.label} tone={group.status.tone} />
      </header>

      <ul className="class-card-meta">
        <li>
          <Icon name="calendar" size={13} />
          {group.schoolYearLabel ? `SY ${group.schoolYearLabel}` : 'School year not set'}
        </li>
      </ul>

      <dl className="class-card-stats">
        <div>
          <dt>Students</dt>
          <dd>{group.studentCount}</dd>
        </div>
        <div>
          <dt>Requirements</dt>
          <dd>{group.requirementCount}</dd>
        </div>
        <div className={group.pendingCount > 0 ? 'is-alert' : ''}>
          <dt>Awaiting</dt>
          <dd>{group.pendingCount}</dd>
        </div>
      </dl>

      <ul className="class-card-activity">
        {activitySummary(group).map((item) => (
          <li key={item.text} className={`activity-item tone-${item.tone}`}>
            <Icon name={item.icon} size={13} />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>

      <div className="class-card-actions">
        {single ? (
          <Link
            className="btn btn-primary btn-sm"
            to={`/teacher/classes/${single.id}`}
            aria-label={`Open ${single.subjectName} class workspace`}
          >
            <Icon name="book" size={14} />
            Open class
          </Link>
        ) : (
          <span className="subtle class-pick">
            {formatCount(group.subjectCount, 'subject')} in this room — open one
            below
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={rosterId}
        >
          <Icon name="chevronDown" size={14} className={open ? 'is-open' : ''} />
          {open ? 'Hide students' : `Students (${group.studentCount})`}
        </Button>
      </div>

      <div className="class-card-subjects">
        <h4 className="class-detail-title">
          <Icon name="book" size={14} />
          Subjects you teach here
        </h4>
        <ul className="subject-list">
          {group.subjects.map((row) => (
            <SubjectRow key={row.id} row={row} />
          ))}
        </ul>
      </div>

      {open && (
        <div id={rosterId} className="class-card-detail">
          <section className="class-detail-block">
            <h4 className="class-detail-title">
              <Icon name="users" size={14} />
              Student list
              <span className="class-detail-count">{group.studentCount}</span>
            </h4>
            {group.studentCount === 0 ? (
              <p className="class-detail-empty">
                No students are enrolled in this section yet.
              </p>
            ) : (
              <ul className="class-roster">
                {group.students.map((student) => (
                  <li key={student.id}>
                    <span className="roster-name">{student.name}</span>
                    {student.lrn && <span className="roster-lrn">{student.lrn}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </article>
  )
}

function ClassToolbar({
  query,
  yearOptions,
  gradeOptions,
  filtersActive,
  onChange,
  onClear,
}) {
  return (
    <div className="filter-bar">
      <div className="field grow">
        <label htmlFor="class-search">Search</label>
        <input
          id="class-search"
          className="input"
          type="search"
          placeholder="Section, subject or student"
          value={query.search}
          onChange={(event) => onChange({ search: event.target.value })}
        />
      </div>

      {yearOptions.length > 1 && (
        <div className="field">
          <label htmlFor="class-year">School year</label>
          <select
            id="class-year"
            className="select"
            value={query.schoolYear}
            onChange={(event) => onChange({ schoolYear: event.target.value })}
          >
            <option value="">All school years</option>
            {yearOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {gradeOptions.length > 1 && (
        <div className="field">
          <label htmlFor="class-grade">Grade level</label>
          <select
            id="class-grade"
            className="select"
            value={query.gradeLevel}
            onChange={(event) => onChange({ gradeLevel: event.target.value })}
          >
            <option value="">All grade levels</option>
            {gradeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label htmlFor="class-status">Status</label>
        <select
          id="class-status"
          className="select"
          value={query.status}
          onChange={(event) => onChange({ status: event.target.value })}
        >
          {STATUS_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="class-sort">Sort by</label>
        <select
          id="class-sort"
          className="select"
          value={query.sort}
          onChange={(event) => onChange({ sort: event.target.value })}
        >
          {SORT_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {filtersActive && (
        <div className="field class-reset">
          <span className="field-spacer" aria-hidden="true" />
          <Button variant="ghost" size="sm" onClick={onClear}>
            <Icon name="close" size={14} />
            Clear filters
          </Button>
        </div>
      )}
    </div>
  )
}

export default function TeacherClassesPage() {
  const { user } = useAuth()
  // A class workspace links back to its own section here, so the search box
  // can arrive filled in from the url.
  const [searchParams] = useSearchParams()
  const urlSearch = searchParams.get('search') || ''
  const [appliedSearch, setAppliedSearch] = useState(urlSearch)
  const [query, setQuery] = useState(() => ({ ...EMPTY_QUERY, search: urlSearch }))
  const [openKey, setOpenKey] = useState(null)

  // Only a change to the url re-seeds the filter; typing in the box does not
  // rewrite it, so the two never fight.
  if (urlSearch !== appliedSearch) {
    setAppliedSearch(urlSearch)
    update({ search: urlSearch })
  }

  const {
    groups,
    totals,
    loading,
    error,
    partialErrors,
    activeSchoolYear,
    reload,
  } = useClassData()

  const visible = useMemo(
    () => sortSectionGroups(filterSectionGroups(groups, query), query.sort),
    [groups, query]
  )

  const yearOptions = useMemo(() => schoolYearsFromRows(groups), [groups])
  const gradeOptions = useMemo(() => gradeLevelsFromRows(groups), [groups])

  const firstName = (user?.fullName || '').split(' ')[0] || ''
  const filtersActive =
    query.search.trim() !== '' ||
    query.schoolYear !== '' ||
    query.gradeLevel !== '' ||
    query.status !== ''

  function update(patch) {
    setQuery((prev) => ({ ...prev, ...patch }))
  }

  function clearFilters() {
    setQuery({ ...EMPTY_QUERY, sort: query.sort })
  }

  if (loading && groups.length === 0) {
    return (
      <div className="teacher-classes-page stack stack-md">
        <span className="sr-only" role="status">
          Loading your classes…
        </span>
        <CardSkeleton lines={2} className="tc-hero-skeleton" />
        <div className="kpi-grid" aria-hidden="true">
          {[0, 1, 2, 3].map((key) => (
            <StatCardSkeleton key={key} />
          ))}
        </div>
        <div className="class-grid" aria-hidden="true">
          {[0, 1, 2].map((key) => (
            <CardSkeleton key={key} lines={4} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="teacher-classes-page stack stack-md">
        <PageHeader title="My Classes" subtitle="Your subject and section assignments." />
        <ErrorMessage error={error} title="Could not load your classes" onRetry={reload} />
      </div>
    )
  }

  return (
    <div className="teacher-classes-page stack stack-md">
      <section className="tc-hero">
        <div className="tc-hero-main">
          <p className="tc-kicker">
            <Icon name="gradCap" size={13} />
            Teacher class workspace
          </p>
          <h1 className="tc-title">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="tc-subtitle">
            {overviewLine(totals, activeSchoolYear?.label)}
          </p>
        </div>
        <div className="tc-hero-side">
          <span className={`tc-year${activeSchoolYear ? ' is-active' : ''}`}>
            <Icon name="calendar" size={14} />
            {activeSchoolYear ? `SY ${activeSchoolYear.label}` : 'No school year is active'}
          </span>
          <StatusBadge
            tone={totals.pending > 0 ? 'amber' : 'green'}
            label={
              totals.pending > 0
                ? `${formatCount(totals.pending, 'submission')} to verify`
                : 'Nothing awaiting verification'
            }
          />
        </div>
      </section>

      <div className="kpi-grid">
        <StatCard
          label="Subject assignments"
          value={totals.assignments}
          hint="Sections × subjects you teach"
          icon="book"
        />
        <StatCard
          label="Assigned sections"
          value={totals.sections}
          hint="Unique class rooms"
          icon="building"
        />
        <StatCard
          label="Students"
          value={totals.students}
          hint="Enrolled in your sections"
          icon="users"
        />
        <StatCard
          label="Pending submissions"
          value={totals.pending}
          tone={totals.pending > 0 ? 'amber' : 'default'}
          hint="Awaiting your verification"
          icon="inbox"
          to="/teacher/review"
        />
      </div>

      {partialErrors.length > 0 && (
        <ErrorMessage
          compact
          error="Some class data did not load, so the counts above may be lower than they should be."
          onRetry={reload}
        />
      )}

      <section className="card">
        <header className="card-header">
          <h2>My classes</h2>
          <span className="class-count">
            {visible.length === groups.length
              ? `${groups.length} ${groups.length === 1 ? 'class' : 'classes'}`
              : `${visible.length} of ${groups.length} classes`}
          </span>
        </header>

        {groups.length > 0 && (
          <ClassToolbar
            query={query}
            yearOptions={yearOptions}
            gradeOptions={gradeOptions}
            filtersActive={filtersActive}
            onChange={update}
            onClear={clearFilters}
          />
        )}

        {groups.length === 0 && (
          <div className="card-body">
            <EmptyState
              icon="book"
              title="No classes assigned yet"
              message="A class appears here once the administrator pairs one of your subjects with a section on Class Assignments. Requirements, review, attendance and grades open from that class as soon as the first assignment exists."
            />
          </div>
        )}

        {groups.length > 0 && visible.length === 0 && (
          <div className="card-body">
            <EmptyState
              icon="search"
              title="No classes match"
              message={`Nothing in your ${formatCount(groups.length, 'class')} matches this search.`}
              action={
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          </div>
        )}

        {visible.length > 0 && (
          <div className="class-grid card-grid">
            {visible.map((group) => (
              <SectionCard
                key={group.key}
                group={group}
                open={openKey === group.key}
                onToggle={() => setOpenKey(openKey === group.key ? null : group.key)}
              />
            ))}
          </div>
        )}
      </section>

      <QuickActions
        actions={[
          {
            label:
              totals.pending > 0
                ? `Review ${totals.pending} submissions`
                : 'Review submissions',
            to: '/teacher/review',
            icon: 'checkSquare',
          },
          { label: 'Attendance for every class', to: '/teacher/attendance', icon: 'calendar' },
          { label: 'Requirements across classes', to: '/teacher/requirements', icon: 'clipboard' },
          { label: 'Announcements', to: '/announcements', icon: 'megaphone' },
          { label: 'Messages', to: '/messages', icon: 'chat' },
        ]}
      />

      {groups.length > 0 && (
        <p className="tc-source-note">
          Classes are grouped by the section you are assigned to: students are
          counted once per section even when you teach several subjects there,
          and every figure is derived from the rows this account is allowed to
          read.
        </p>
      )}
    </div>
  )
}
