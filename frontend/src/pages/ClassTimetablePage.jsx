import { useMemo, useState } from 'react'
import Button from '../components/Button'
import ChildSelector from '../components/ChildSelector'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import { StatCardSkeleton } from '../components/loading'
import useFetch from '../hooks/useFetch'
import ScheduleDetailModal from '../components/schedules/ScheduleDetailModal'
import ScheduleFilters from '../components/schedules/ScheduleFilters'
import TimetableGrid, { TimetableSkeleton } from '../components/schedules/TimetableGrid'
import {
  applyFilters,
  dayLabel,
  filterOptions,
  scheduleSummary,
  todayWeekday,
  weekRangeLabel,
} from '../utils/schedules'
import './SchedulesPage.css'

const NO_FILTERS = { teacher: '', section: '', subject: '', day: '' }

/**
 * What each read-only audience is being shown, and what they may filter by.
 *
 * A teacher owns several sections but one roster of colleagues; a learner sits
 * in one section, so the section and teacher filters would each offer exactly
 * one value. The fourth figure follows the same split.
 */
const SCOPES = {
  teacher: {
    title: 'My timetable',
    subtitle: 'Every class you teach, laid out period by period across the week.',
    emptyTitle: 'No classes on your timetable yet',
    emptyMessage:
      'The Registrar sets the weekly timetable. Your classes appear here as soon as they are given a day and a time.',
    fields: ['section', 'subject', 'day'],
    groupLabel: 'Sections taught',
    groupCount: (options) => options.sections.length,
    groupHint: 'Classes you are assigned to',
  },
  student: {
    title: 'My schedule',
    subtitle: 'Your class timetable — what is taught, when, and in which room.',
    emptyTitle: 'No timetable for your section yet',
    emptyMessage:
      'The weekly schedule for your section has not been published. It appears here once the Registrar sets it.',
    fields: ['subject', 'day'],
    groupLabel: 'Teachers',
    groupCount: (options) => options.teachers.length,
    groupHint: 'Named across your classes',
  },
  parent: {
    title: 'Class schedule',
    subtitle: 'Your child’s weekly timetable — what is taught, when, and in which room.',
    emptyTitle: 'No timetable for this child yet',
    emptyMessage:
      'The weekly schedule for this section has not been published. It appears here once the Registrar sets it.',
    fields: ['subject', 'day'],
    groupLabel: 'Teachers',
    groupCount: (options) => options.teachers.length,
    groupHint: 'Named across their classes',
  },
}

function Summary({ scope, stats, options, failed, loading, today }) {
  const copy = SCOPES[scope]

  if (loading && !stats) {
    return (
      <div className="kpi-grid">
        {[0, 1, 2, 3].map((key) => (
          <StatCardSkeleton key={key} />
        ))}
      </div>
    )
  }

  if (failed || !stats) {
    return (
      <div className="kpi-grid">
        <StatCard label="Class periods" value="—" hint="Could not be counted" icon="calendar" />
        <StatCard label="Classes today" value="—" hint={dayLabel(today)} icon="clock" />
        <StatCard label="Subjects" value="—" hint="Could not be counted" icon="book" />
        <StatCard label={copy.groupLabel} value="—" hint="Could not be counted" icon="users" />
      </div>
    )
  }

  return (
    <div className="kpi-grid">
      <StatCard
        label="Class periods"
        value={stats.total}
        hint={
          stats.total ? `Across ${stats.days} day${stats.days === 1 ? '' : 's'}` : 'Nothing booked yet'
        }
        icon="calendar"
      />
      <StatCard label="Classes today" value={stats.today} hint={dayLabel(today)} icon="clock" />
      <StatCard
        label="Subjects"
        value={options.subjects.length}
        hint={options.subjects.length ? 'On this timetable' : 'No subjects yet'}
        icon="book"
      />
      <StatCard
        label={copy.groupLabel}
        value={copy.groupCount(options)}
        hint={copy.groupHint}
        icon="users"
      />
    </div>
  )
}

/**
 * The weekly timetable, read-only side.
 *
 * Teachers, learners and parents all look at the same grid the Registrar
 * builds; the server decides which rows each of them gets, so this screen asks
 * one question of `/schedules/` and never names an id it was not given. A
 * parent asks for one child at a time, and only once the roster says who.
 */
export default function ClassTimetablePage({ scope = 'teacher', fetchParams }) {
  const copy = SCOPES[scope] || SCOPES.teacher
  const isParent = scope === 'parent'

  const [nonce, setNonce] = useState(0)
  const [filterState, setFilterState] = useState({ child: null, values: NO_FILTERS })
  const [selected, setSelected] = useState(null)
  const [selectedChild, setSelectedChild] = useState(null)

  // The same roster the parent dashboard reads: id, name and section per child.
  const roster = useFetch('/dashboard/', { enabled: isParent })
  const children = useMemo(() => roster.data?.children || [], [roster.data])
  const activeChild =
    children.find((child) => child.student_id === selectedChild) || children[0] || null

  const schedules = useFetch('/schedules/', {
    list: true,
    params: isParent
      ? activeChild
        ? { child: activeChild.student_id }
        : undefined
      : fetchParams,
    // Reading before the child is known would fetch the whole family and then
    // fetch again the moment a child is picked.
    enabled: !isParent || Boolean(activeChild),
    deps: [nonce],
  })
  const rows = useMemo(() => schedules.data || [], [schedules.data])

  // The timetable is a weekly pattern, so "today" is read once per mount rather
  // than recomputed while someone works through the filters.
  const today = useMemo(() => todayWeekday(), [])
  const weekLabel = useMemo(() => weekRangeLabel(), [])

  // A filter that narrowed one child's week must not silently hide the next
  // child's, so the values belong to the child they were set for.
  const filters =
    !isParent || filterState.child === activeChild?.student_id
      ? filterState.values
      : NO_FILTERS

  const stats = useMemo(() => scheduleSummary(rows, today), [rows, today])
  const options = useMemo(() => filterOptions(rows), [rows])
  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters])

  const rosterFailed = isParent && Boolean(roster.error)
  const rosterStarting = isParent && roster.loading && roster.data === null
  const noChildren = isParent && !rosterStarting && !rosterFailed && children.length === 0

  const failed = Boolean(schedules.error) || rosterFailed
  const loaded = !failed && schedules.data !== null
  const starting = (schedules.loading && schedules.data === null) || rosterStarting

  return (
    <>
      <PageHeader
        title={copy.title}
        subtitle={
          isParent && activeChild
            ? `${copy.subtitle} Showing ${activeChild.name}.`
            : copy.subtitle
        }
      />

      <div className="stack stack-md">
        {isParent && (
          <ChildSelector
            items={children}
            selectedId={activeChild?.student_id}
            // A period left open belongs to the child being switched away from.
            onSelect={(studentId) => {
              setSelected(null)
              setSelectedChild(studentId)
            }}
          />
        )}

        <Summary
          scope={scope}
          stats={loaded ? stats : null}
          options={options}
          failed={failed}
          loading={schedules.loading || rosterStarting}
          today={today}
        />

        <div className="sched-toolbar">
          <div className="sched-toolbar-left">
            <span className="sched-week-label">
              <Icon name="calendar" size={16} aria-hidden="true" />
              This week
              <span className="subtle">· {weekLabel}</span>
            </span>
            <StatusBadge
              tone="neutral"
              label="Recurring"
              title="The timetable shows recurring weekly classes, not one-off events"
            />
          </div>

          <div className="sched-toolbar-right">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setNonce((n) => n + 1)}
              disabled={schedules.loading || rosterStarting}
            >
              <Icon name="refresh" size={13} />
              Refresh
            </Button>
          </div>
        </div>

        {loaded && rows.length > 0 && (
          <ScheduleFilters
            options={options}
            values={filters}
            onChange={(key, value) =>
              setFilterState({
                child: activeChild?.student_id ?? null,
                values: { ...filters, [key]: value },
              })
            }
            onClear={() =>
              setFilterState({ child: activeChild?.student_id ?? null, values: NO_FILTERS })
            }
            fields={copy.fields}
            disabled={failed}
          />
        )}

        <section className="sched-timetable-card">
          {starting && <TimetableSkeleton today={today} />}

          {/* The parent's week is the child's section, so a roster that never
              arrived or names no child is a state of its own. */}
          {rosterFailed && (
            <div className="sched-panel-message">
              <ErrorMessage
                error={roster.error}
                title="Could not load your children"
                onRetry={roster.reload}
              />
            </div>
          )}

          {noChildren && (
            <div className="sched-panel-empty">
              <EmptyState
                icon="users"
                title="No linked children"
                message="Your account is not connected to a student record yet."
              />
            </div>
          )}

          {failed && !rosterFailed && (
            <div className="sched-panel-message">
              <ErrorMessage
                error={schedules.error}
                title="Could not load your timetable"
                onRetry={schedules.reload}
              />
            </div>
          )}

          {loaded && rows.length === 0 && (
            <div className="sched-panel-empty">
              <EmptyState
                icon="calendar"
                title={copy.emptyTitle}
                message={copy.emptyMessage}
              />
            </div>
          )}

          {loaded && rows.length > 0 && filtered.length === 0 && (
            <div className="sched-panel-empty">
              <EmptyState
                icon="search"
                title="No classes match your filters"
                message="Try a different subject or day, or clear the filters to see the whole week."
              />
            </div>
          )}

          {loaded && filtered.length > 0 && (
            <TimetableGrid
              schedules={filtered}
              conflicts={[]}
              reasons={new Map()}
              today={today}
              onScheduleClick={setSelected}
              readOnly
            />
          )}
        </section>
      </div>

      {selected && (
        <ScheduleDetailModal schedule={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
