import { useEffect, useMemo, useState } from 'react'
import Card from '../../components/dashboard/Card'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import Icon from '../../components/Icon'
import Pagination from '../../components/Pagination'
import TableSkeleton from '../../components/loading/TableSkeleton'
import Button from '../../components/Button'
import useServerList from '../../hooks/useServerList'
import {
  ClearFiltersButton,
  CompletionCell,
  DateField,
  SearchField,
  SelectField,
  SessionBadge,
} from './parts'
import { formatDate } from '../../utils/format'
import {
  SESSION_STATUS_CHOICES,
  completionOf,
  isoDay,
  sessionMeta,
  sessionQuery,
  sessionStartTime,
  sessionState,
  sessionTimeLabel,
  shiftDay,
} from '../../utils/attendance'

const DAY_PAGE_SIZE = 20
const UPCOMING_LIMIT = 8

/**
 * The sessions board: the day on screen as cards, the days ahead as a list.
 *
 * Two bounded reads, never the whole term. The card grid asks for one day
 * (`date=`) and the list asks for the eight sessions after it
 * (`date_after=` + one page), so the initial view carries a handful of flat
 * rows however many sessions the teacher has collected since September. The
 * complete record lives in Attendance history, which pages on the server.
 */
export default function SessionsBoard({
  assignments = [],
  classLocked = false,
  initialClassId = '',
  onOpen,
  refreshKey = 0,
}) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [classIdState, setClassIdState] = useState(initialClassId)
  // A locked class is read from the route on every render, so moving the class
  // workspace from one class's attendance to another cannot keep the old id.
  const classId = classLocked ? String(initialClassId || '') : classIdState
  const [subject, setSubject] = useState('')
  const [status, setStatus] = useState('')
  const [day, setDay] = useState(isoDay())
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const shared = {
    assignment: classId,
    subject,
    status,
    search: debouncedSearch,
  }

  const dayRead = useServerList('/attendance/sessions/', {
    params: sessionQuery({ ...shared, date: day, page, pageSize: DAY_PAGE_SIZE }),
    refreshKey,
  })
  const upcomingRead = useServerList('/attendance/sessions/', {
    params: sessionQuery({
      ...shared,
      dateAfter: shiftDay(day, 1),
      page: 1,
      pageSize: UPCOMING_LIMIT,
      ordering: 'date',
    }),
    refreshKey,
  })

  // Scheduled order first: the register is read down the timetable, not by id.
  const sessions = useMemo(
    () =>
      [...dayRead.rows].sort((a, b) => {
        const left = sessionStartTime(a)
        const right = sessionStartTime(b)
        if (left && right && left !== right) return left.localeCompare(right)
        return a.id - b.id
      }),
    [dayRead.rows]
  )
  const upcoming = upcomingRead.rows

  const subjects = useMemo(() => {
    const map = new Map()
    assignments.forEach((a) => {
      if (a.subject && a.subject_name) map.set(String(a.subject), a.subject_name)
    })
    return [...map].sort((a, b) => a[1].localeCompare(b[1]))
  }, [assignments])

  const hasFilters =
    Boolean(debouncedSearch) ||
    Boolean(subject) ||
    Boolean(status) ||
    (!classLocked && Boolean(classId)) ||
    day !== isoDay()

  function clearFilters() {
    setSearch('')
    setDebouncedSearch('')
    setClassIdState('')
    setSubject('')
    setStatus('')
    setDay(isoDay())
    setPage(1)
  }

  function narrow(apply) {
    apply()
    setPage(1)
  }

  const loading = (dayRead.loading && dayRead.rows.length === 0) || (upcomingRead.loading && upcoming.length === 0)
  const error = dayRead.error || upcomingRead.error

  return (
    <div className="stack stack-md">
      <section className="card">
        <header className="card-header">
          <div className="stack stack-xs">
            <h2>{day === isoDay() ? 'Today’s sessions' : `Sessions on ${formatDate(day)}`}</h2>
            <span className="subtle">
              {dayRead.count === 0
                ? 'Nothing scheduled for this day'
                : `${dayRead.count} session${dayRead.count === 1 ? '' : 's'} on this day`}
            </span>
          </div>
        </header>

        <div className="att-filters">
          <SearchField
            id="board-search"
            label="Search sessions"
            placeholder="Search class, subject or learner…"
            value={search}
            onChange={(value) => narrow(() => setSearch(value))}
            disabled={dayRead.loading}
          />
          {!classLocked && (
            <SelectField
              id="filter-class"
              label="Filter by class"
              value={classId}
              onChange={(value) => narrow(() => setClassIdState(value))}
              disabled={dayRead.loading}
              options={[
                { value: '', label: 'All classes' },
                ...assignments.map((a) => ({
                  value: String(a.id),
                  label: `${a.subject_name} — ${a.section_name}`,
                })),
              ]}
            />
          )}
          <SelectField
            id="filter-subject"
            label="Filter by subject"
            value={subject}
            onChange={(value) => narrow(() => setSubject(value))}
            disabled={dayRead.loading}
            options={[
              { value: '', label: 'All subjects' },
              ...subjects.map(([id, name]) => ({ value: id, label: name })),
            ]}
          />
          <SelectField
            id="filter-status"
            label="Filter by status"
            value={status}
            onChange={(value) => narrow(() => setStatus(value))}
            disabled={dayRead.loading}
            options={SESSION_STATUS_CHOICES}
          />
          <DateField
            id="filter-date"
            label="Filter by date"
            value={day}
            onChange={(value) => narrow(() => setDay(value || isoDay()))}
            disabled={dayRead.loading}
          />
          <div className="row att-day-nav">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => narrow(() => setDay(shiftDay(day, -1)))}
              aria-label="Previous day"
            >
              <Icon name="chevronLeft" size={14} />
            </Button>
            {day !== isoDay() && (
              <Button variant="ghost" size="sm" onClick={() => narrow(() => setDay(isoDay()))}>
                Today
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => narrow(() => setDay(shiftDay(day, 1)))}
              aria-label="Next day"
            >
              <Icon name="chevronRight" size={14} />
            </Button>
          </div>
          <ClearFiltersButton
            onClick={clearFilters}
            label="Clear session filters"
            hidden={!hasFilters}
          />
        </div>

        {error && (
          <div className="card-body">
            <ErrorMessage
              error={error}
              title="Could not load sessions"
              onRetry={() => {
                dayRead.reload()
                upcomingRead.reload()
              }}
            />
          </div>
        )}

        {!error && loading && (
          <div className="card-body">
            <ListSkeletonCards />
          </div>
        )}

        {!error && !loading && sessions.length === 0 && (
          <div className="card-body">
            <EmptyState
              icon="calendar"
              title={hasFilters ? 'No sessions match your filters' : 'No sessions on this day'}
              message={
                hasFilters
                  ? 'Try widening the date or clearing a filter.'
                  : 'Sessions generated from your timetable appear here.'
              }
            />
          </div>
        )}

        {!error && !loading && sessions.length > 0 && (
          <div className="card-body">
            <div className="att-day-grid">
              {sessions.map((session) => (
                <SessionCard key={session.id} session={session} onOpen={onOpen} />
              ))}
            </div>
          </div>
        )}

        {dayRead.totalPages > 1 && (
          <div className="att-pager">
            <Pagination
              idPrefix="att-day"
              page={dayRead.page}
              totalPages={dayRead.totalPages}
              onPage={setPage}
              loading={dayRead.loading}
              info={`${dayRead.count} sessions on this day · page ${dayRead.page} of ${dayRead.totalPages}`}
            />
          </div>
        )}
      </section>

      <Card
        title="Upcoming sessions"
        action={
          <span className="subtle">
            {upcomingRead.count > upcoming.length
              ? `next ${upcoming.length} of ${upcomingRead.count}`
              : `${upcomingRead.count} scheduled ahead`}
          </span>
        }
        empty={
          !upcomingRead.loading && !upcomingRead.error && upcoming.length === 0 ? (
            <EmptyState
              icon="clock"
              title="Nothing scheduled ahead"
              message="Generated sessions for the days after this one will be listed here."
            />
          ) : null
        }
      >
        {upcomingRead.loading && upcoming.length === 0 ? (
          <TableSkeleton headers={['Date', 'Time', 'Class', 'Subject', 'Status']} rows={3} />
        ) : (
          <ul className="att-upcoming">
            {upcoming.map((session) => {
              const meta = sessionMeta(sessionState(session, day))
              return (
                <li key={session.id} className="att-upcoming-row">
                  <span className="att-upcoming-date">{formatDate(session.date)}</span>
                  <span className="att-upcoming-time">{sessionTimeLabel(session)}</span>
                  <span className="att-upcoming-class text-truncate">
                    {session.subject_name || '—'} · {session.section_name || '—'}
                  </span>
                  <SessionBadge session={session} today={day} />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onOpen(session)}
                    aria-label={`${meta.action} for ${session.section_name} on ${formatDate(session.date)}`}
                  >
                    {meta.action}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

/** One day's session: what it is, where it stands, and the one thing to do. */
function SessionCard({ session, onOpen }) {
  const state = sessionState(session, isoDay())
  const meta = sessionMeta(state)
  const completion = completionOf(session)

  return (
    <article className={`att-session-card is-${state}`}>
      <header className="att-session-head">
        <h3 className="att-session-subject text-truncate" title={session.subject_name || '—'}>
          {session.subject_name || '—'}
        </h3>
        <SessionBadge session={session} />
      </header>

      <p className="att-session-class text-truncate" title={session.section_name || '—'}>
        {session.section_name || '—'}
      </p>
      <p className="att-session-time">
        <Icon name="clock" size={13} />
        {sessionTimeLabel(session)}
      </p>

      <div className="att-session-progress">
        <CompletionCell completion={completion} />
      </div>

      <Button
        variant={state === 'not_started' || state === 'in_progress' ? 'primary' : 'secondary'}
        size="sm"
        onClick={() => onOpen(session)}
        aria-label={`${meta.action} · ${session.section_name}, ${formatDate(session.date)}`}
      >
        {meta.action}
      </Button>
    </article>
  )
}

/** Card-shaped placeholder in the real grid, so nothing jumps when rows land. */
function ListSkeletonCards() {
  return (
    <div className="att-day-grid" aria-hidden="true">
      {[0, 1, 2].map((key) => (
        <div className="att-session-card" key={key}>
          <span className="skeleton" style={{ width: '58%' }} />
          <span className="skeleton" style={{ width: '42%' }} />
          <span className="skeleton" style={{ width: '72%' }} />
          <span className="skeleton" style={{ width: 120, height: 30 }} />
        </div>
      ))}
    </div>
  )
}
