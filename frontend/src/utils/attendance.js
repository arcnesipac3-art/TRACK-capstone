/**
 * Attendance derivations shared by the teacher screens.
 *
 * Everything here is a pure function over real API rows so the screens stay
 * thin and the rules — what counts as missed, how a completion fraction is
 * read, what a filter bar sends to the server — have one home and can be
 * tested without a DOM.
 */

export const MARK_STATUSES = ['present', 'absent', 'late', 'excused']

/** Session statuses the server stores. `missed` is not one of them. */
export const STORED_SESSION_STATUSES = ['not_started', 'in_progress', 'completed']

/** The four values the history filter offers, including the derived two. */
export const SESSION_FILTER_STATUSES = [
  { value: '', label: 'Any status' },
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'missed', label: 'Missed' },
]

/**
 * Local calendar day as `YYYY-MM-DD`.
 *
 * `new Date().toISOString()` is UTC, which flips the date for a Philippine
 * teacher between 8pm and midnight and would then ask the server for tomorrow's
 * sessions. Every day boundary here is the browser's own.
 */
export function isoDay(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * The one status the screens show for a session.
 *
 * A past day that was never finished is "Missed" — derived here, in the same
 * rule the server's `status=missed` filter uses, so the card and the filter
 * can never disagree and no column had to be added to the database.
 */
export function sessionState(session, today = isoDay()) {
  if (!session) return 'not_started'
  if (session.status === 'completed') return 'completed'
  if (session.date < today) return 'missed'
  if (session.status === 'in_progress') return 'in_progress'
  return 'not_started'
}

const SESSION_META = {
  not_started: { label: 'Not Started', tone: 'neutral', action: 'Take attendance' },
  in_progress: { label: 'In Progress', tone: 'amber', action: 'Continue marking' },
  completed: { label: 'Completed', tone: 'green', action: 'View session' },
  missed: { label: 'Missed', tone: 'red', action: 'View details' },
}

/** Badge text, badge tone and the single action a card offers for a status. */
export function sessionMeta(state) {
  return SESSION_META[state] || SESSION_META.not_started
}

/**
 * Tallies for one session row.
 *
 * A `?brief=1` row carries the server's annotations; an older nested row
 * carries `records`. Reading both keeps every screen working while the lists
 * move over, and never asks for a roster to print a fraction.
 */
export function sessionCounts(session) {
  if (!session) return { marked: 0, present: 0, absent: 0, late: 0, excused: 0, enrolled: 0 }
  const records = Array.isArray(session.records) ? session.records : null
  const counts = {
    marked: Number(session.record_count ?? 0),
    present: Number(session.present_count ?? 0),
    absent: Number(session.absent_count ?? 0),
    late: Number(session.late_count ?? 0),
    excused: Number(session.excused_count ?? 0),
    enrolled: Number(session.enrolled ?? 0),
  }
  if (!records) return counts
  // Nested fallback: the annotations are absent, the rows are present.
  counts.marked = records.length
  MARK_STATUSES.forEach((status) => {
    counts[status] = records.filter((record) => record.status === status).length
  })
  return counts
}

/** Completion of a session against the learners enrolled in its class. */
export function completionOf(session) {
  if (!session) return null
  const { marked, enrolled } = sessionCounts(session)
  if (!enrolled) return { marked, enrolled: 0, percentage: 0, isComplete: marked > 0 }
  return {
    marked,
    enrolled,
    percentage: Math.round((marked / enrolled) * 100),
    isComplete: marked >= enrolled,
  }
}

/** Scheduled start time of a session, from either row shape. */
export function sessionStartTime(session) {
  if (!session) return null
  if (session.start_time) return session.start_time
  const nested = session.schedule_time || session.schedule
  return (nested && nested.start_time) || null
}

/** `08:00 – 09:00 · Room 3`, or `No scheduled time` for a manual session. */
export function sessionTimeLabel(session) {
  const start = sessionStartTime(session)
  if (!start) return 'No scheduled time'
  const nested = session.schedule_time || session.schedule || {}
  const end = session.end_time || nested.end_time
  const room = session.room || nested.room
  const span = end ? `${start} – ${end}` : start
  return room ? `${span} · ${room}` : span
}

/** Today / upcoming / past, each in the order the server already gave them. */
export function groupSessionsByDay(sessions, today = isoDay()) {
  const groups = { today: [], upcoming: [], past: [] }
  ;(sessions || []).forEach((session) => {
    if (session.date === today) groups.today.push(session)
    else if (session.date > today) groups.upcoming.push(session)
    else groups.past.push(session)
  })
  // Soonest first for the day ahead; the past list is newest-first already
  // because that is what the server sorted.
  groups.today.sort(byStartThenId)
  groups.upcoming.sort(byDateThenStartThenId)
  return groups
}

function byStartThenId(a, b) {
  const left = sessionStartTime(a)
  const right = sessionStartTime(b)
  if (left && right && left !== right) return left.localeCompare(right)
  return a.id - b.id
}

function byDateThenStartThenId(a, b) {
  if (a.date !== b.date) return a.date.localeCompare(b.date)
  return byStartThenId(a, b)
}

/**
 * A day shifted by `delta` calendar days, still in the browser's own day.
 *
 * The sessions board reads one day at a time, so "the day after the one on
 * screen" is the boundary between the cards and the upcoming list — and it has
 * to cross a month end without help from UTC.
 */
export function shiftDay(iso, delta = 1) {
  const [year, month, day] = (iso || isoDay()).split('-').map(Number)
  const date = new Date(year, month - 1, day + delta)
  return isoDay(date)
}

/**
 * The four dashboard figures, read from the server's own counts.
 *
 * Each card is a `page_size=1` request for its filtered slice, so the number
 * is the total the database has — not the length of whatever the browser
 * happened to load.
 */
export function dashboardCards({
  todayCount = 0,
  completedCount = 0,
  pendingCount = 0,
  studentCount = 0,
}) {
  return [
    {
      id: 'todayCount',
      label: "Today's Sessions",
      value: todayCount,
      hint: todayCount === 1 ? 'session scheduled today' : 'sessions scheduled today',
      tone: 'default',
      icon: 'calendar',
    },
    {
      id: 'completedCount',
      label: 'Completed Sessions',
      value: completedCount,
      hint: 'marked for every enrolled learner',
      tone: 'green',
      icon: 'check',
    },
    {
      id: 'pendingCount',
      label: 'Pending Sessions',
      value: pendingCount,
      hint: 'still to be taken or finished',
      tone: 'amber',
      icon: 'clock',
    },
    {
      id: 'studentCount',
      label: 'Assigned Students',
      value: studentCount,
      hint: 'in the classes you teach',
      tone: 'default',
      icon: 'users',
    },
  ]
}

/**
 * The four reads behind the dashboard figures.
 *
 * Each is a `page_size=1` count of a filtered slice, so every number is the
 * database's own. Counting the rows a list happens to have loaded would be
 * wrong for any teacher with more than one page of history — which is every
 * teacher by the middle of a term.
 */
export function statsQueries({ assignment = '', section = '', today = isoDay() } = {}) {
  const scope = {}
  if (assignment) scope.teacher_assignment = assignment
  if (section) scope.section = section

  return [
    { id: 'todayCount', path: '/attendance/sessions/', params: { brief: 1, date: today, ...scope } },
    { id: 'completedCount', path: '/attendance/sessions/', params: { brief: 1, status: 'completed', ...scope } },
    { id: 'pendingCount', path: '/attendance/sessions/', params: { brief: 1, status: 'outstanding', ...scope } },
    { id: 'studentCount', path: '/students/', params: section ? { section } : {} },
  ]
}

/** Query params for one page of the session list. */
export function sessionQuery({
  page = 1,
  pageSize = 20,
  date = '',
  dateAfter = '',
  dateBefore = '',
  assignment = '',
  section = '',
  subject = '',
  status = '',
  search = '',
  ordering = '-date',
} = {}) {
  return {
    brief: 1,
    page,
    page_size: pageSize,
    date: date || undefined,
    date_after: dateAfter || undefined,
    date_before: dateBefore || undefined,
    teacher_assignment: assignment || undefined,
    section: section || undefined,
    subject: subject || undefined,
    status: status || undefined,
    search: search.trim() || undefined,
    ordering: ordering || undefined,
  }
}

/** Both lists sort the same two ways the history screen promises. */
export const DATE_SORT_OPTIONS = [
  { value: '-date', label: 'Newest first' },
  { value: 'date', label: 'Oldest first' },
]

/** Query params for one page of the record (mark) list. */
export function recordQuery({
  page = 1,
  pageSize = 20,
  session = '',
  student = '',
  date = '',
  dateAfter = '',
  dateBefore = '',
  assignment = '',
  section = '',
  subject = '',
  status = '',
  search = '',
  ordering = '-date',
} = {}) {
  return {
    page,
    page_size: pageSize,
    session: session || undefined,
    student: student || undefined,
    date: date || undefined,
    date_after: dateAfter || undefined,
    date_before: dateBefore || undefined,
    teacher_assignment: assignment || undefined,
    section: section || undefined,
    subject: subject || undefined,
    status: status || undefined,
    search: search.trim() || undefined,
    ordering: ordering || undefined,
  }
}

/** `status` on a session row means three things at once in the filter bar. */
export const SESSION_STATUS_CHOICES = SESSION_FILTER_STATUSES

/**
 * Rows whose mark differs from what the server holds.
 *
 * The sheet stages edits in `pending` and keeps the saved state in `records`;
 * this is the one place those two are compared, so the dirty count, the
 * unsaved warning and the bulk payload can never disagree.
 */
export function changedMarks({ roster, pending, savedById }) {
  return roster
    .map((student) => {
      const draft = pending[student.id]
      if (!draft) return null
      const saved = savedById.get(student.id)
      const status = draft.status ?? saved?.status
      const notes = (draft.notes ?? saved?.notes ?? '').trim()
      if (!status) return null
      if (saved && saved.status === status && (saved.notes || '') === notes) return null
      return { student: student.id, status, notes }
    })
    .filter(Boolean)
}

/** Every unmarked learner in `present` — the Mark-all-present draft. */
export function markAllPresentDraft({ roster, savedById, pending }) {
  const next = { ...pending }
  roster.forEach((student) => {
    const current = next[student.id]?.status ?? savedById.get(student.id)?.status
    if (current !== 'present') {
      next[student.id] = { ...next[student.id], status: 'present' }
    }
  })
  return next
}

/** Roster search over the two identifiers a teacher actually reads. */
export function searchRoster(roster, query) {
  const needle = (query || '').trim().toLowerCase()
  if (!needle) return roster
  return roster.filter((student) => {
    const name = (student.user?.full_name || student.user?.username || '').toLowerCase()
    const lrn = (student.lrn || '').toLowerCase()
    return name.includes(needle) || lrn.includes(needle)
  })
}

/**
 * The first `size` rows, so a big register paints one screen instead of two
 * hundred. `shown` tells the caller whether the rest is still reachable.
 */
export function windowOf(rows, size) {
  const list = Array.isArray(rows) ? rows : []
  const shown = Math.min(Math.max(1, size), list.length)
  return { rows: list.slice(0, shown), shown, total: list.length, hidden: list.length - shown }
}

/** How many marks a bulk response reported, for the success line. */
export function bulkResult(response) {
  const created = Number(response?.created || 0)
  const updated = Number(response?.updated || 0)
  return {
    created,
    updated,
    unchanged: Number(response?.unchanged || 0),
    written: created + updated,
    session: response?.session || null,
  }
}

/** The server's rejection list, turned into one readable sentence. */
export function rejectionMessage(payload) {
  const rejected = payload && Array.isArray(payload.rejected) ? payload.rejected : null
  if (!rejected || rejected.length === 0) {
    return (payload && (payload.error || payload.detail)) || 'The marks were not saved.'
  }
  const first = rejected[0]
  const more = rejected.length > 1 ? ` (+${rejected.length - 1} more)` : ''
  return `${rejected.length} entr${rejected.length === 1 ? 'y' : 'ies'} rejected: ${first?.error || 'check the marks'}${more}`
}

/**
 * The session a mark belongs to, in the shape a list row has.
 *
 * A record embeds only `id`, `date`, `subject_name` and `section_name` for its
 * session, so a learner's history can open that session's own view without a
 * second list query — and the view fetches the rest by id.
 */
export function sessionRowFromRecord(record) {
  const detail = record.session_detail || {}
  return {
    id: record.session ?? detail.id,
    date: detail.date,
    subject_name: detail.subject_name,
    section_name: detail.section_name,
  }
}

/** Percentage present over the marks recorded so far. */
export function presentRate(counts) {
  const marked = counts?.marked || 0
  if (!marked) return null
  return Math.round((counts.present / marked) * 1000) / 10
}
