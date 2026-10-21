/** Date, time and status formatting helpers shared across TRACK screens. */

const DATE_OPTS = { year: 'numeric', month: 'short', day: 'numeric' }
const DATETIME_OPTS = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}

/** Today's date label, resolved once when the app bundle loads. */
export const TODAY_LABEL = new Date().toLocaleDateString('en-PH', DATE_OPTS)

function toDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value) {
  const date = toDate(value)
  return date ? date.toLocaleDateString('en-PH', DATE_OPTS) : '—'
}

export function formatDateTime(value) {
  const date = toDate(value)
  return date ? date.toLocaleDateString('en-PH', DATETIME_OPTS) : '—'
}

export function formatTime(value) {
  const date = toDate(value)
  return date
    ? date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
    : '—'
}

/** "just now" · "12 min ago" · "yesterday" · "Oct 12" */
export function formatRelative(value) {
  const date = toDate(value)
  if (!date) return '—'
  const diffMs = Date.now() - date.getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return formatDate(date)
}

/** Deadline phrasing + urgency tone. */
export function deadlineInfo(value) {
  const date = toDate(value)
  if (!date) return { label: 'No deadline set', tone: 'neutral', days: null }
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDeadline = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  )
  const days = Math.round((startOfDeadline - startOfToday) / 86400000)

  if (days < 0) {
    const n = Math.abs(days)
    return {
      label: `Overdue by ${n} day${n > 1 ? 's' : ''}`,
      tone: 'red',
      days,
    }
  }
  if (days === 0) return { label: 'Due today', tone: 'amber', days }
  if (days === 1) return { label: 'Due tomorrow', tone: 'amber', days }
  if (days <= 7) return { label: `Due in ${days} days`, tone: 'amber', days }
  return { label: `Due in ${days} days`, tone: 'neutral', days }
}

/** Server submission status → { label, tone }. */
export const SUBMISSION_STATUS = {
  not_submitted: { label: 'Not submitted', tone: 'neutral' },
  submitted: { label: 'Awaiting verification', tone: 'amber' },
  verified: { label: 'Verified', tone: 'green' },
  returned: { label: 'Returned for revision', tone: 'red' },
  overdue: { label: 'Overdue', tone: 'red' },
}

export function submissionStatus(status) {
  return (
    SUBMISSION_STATUS[status] || { label: status || 'Unknown', tone: 'neutral' }
  )
}

/** Server attendance status → { label, tone }. */
export const ATTENDANCE_STATUS = {
  present: { label: 'Present', tone: 'green' },
  absent: { label: 'Absent', tone: 'red' },
  late: { label: 'Late', tone: 'amber' },
  excused: { label: 'Excused', tone: 'blue' },
}

export function attendanceStatus(status) {
  return (
    ATTENDANCE_STATUS[status] || { label: status || 'Unknown', tone: 'neutral' }
  )
}

export function requirementType(type) {
  const map = {
    assignment: 'Assignment',
    project: 'Project',
    activity: 'Activity',
    quiz: 'Quiz',
    performance: 'Performance task',
    other: 'Other',
  }
  return map[type] || 'Requirement'
}

export function roleLabel(role) {
  const map = {
    admin: 'Administrator',
    teacher: 'Teacher',
    student: 'Student',
    parent: 'Parent',
  }
  return map[role] || 'User'
}

export function initials(name) {
  // Note: no default parameter — `name = ''` only fires for `undefined`, so
  // `null` would become the literal string "null" and yield initials of "N".
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return '?'
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

/** Dashboard route for each role. */
export function dashboardPath(role) {
  return `/${role}/dashboard`
}

/** Format a number with commas (e.g., 12345 -> 12,345). */
export function formatNumber(value) {
  return Number(value || 0).toLocaleString()
}

/** Format currency in Philippine Peso (e.g., 5000 -> ₱5,000.00). */
export function formatCurrency(value) {
  return '₱' + Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
