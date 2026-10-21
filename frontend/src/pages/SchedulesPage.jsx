import { useEffect, useMemo, useState, useRef } from 'react'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import Icon from '../components/Icon'
import LoadingSpinner from '../components/LoadingSpinner'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import useFetch from '../hooks/useFetch'
import api from '../services/api'
import './SchedulesPage.css'

const DAYS_OF_WEEK = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
]

function normTime(t) {
  return t?.slice(0, 5) ?? ''
}

function timeToMinutes(t) {
  const [h, m] = normTime(t).split(':').map(Number)
  return h * 60 + m
}

function generatePeriodGrid(schedules) {
  if (!schedules || schedules.length === 0) return []
  const timeBoundaries = new Set()
  schedules.forEach((s) => {
    timeBoundaries.add(normTime(s.start_time))
    timeBoundaries.add(normTime(s.end_time))
  })
  const sortedTimes = Array.from(timeBoundaries).sort((a, b) => timeToMinutes(a) - timeToMinutes(b))
  const periods = []
  for (let i = 0; i < sortedTimes.length - 1; i++) {
    const start = sortedTimes[i]
    const end = sortedTimes[i + 1]
    const startMin = timeToMinutes(start)
    const endMin = timeToMinutes(end)
    if (endMin > startMin) {
      periods.push({
        index: periods.length + 1,
        start,
        end,
        startMin,
        endMin,
        duration: endMin - startMin,
      })
    }
  }
  return periods
}

function schedulesOverlap(s1, s2) {
  if (s1.day_of_week !== s2.day_of_week) return false
  const s1Start = normTime(s1.start_time)
  const s1End = normTime(s1.end_time)
  const s2Start = normTime(s2.start_time)
  const s2End = normTime(s2.end_time)
  // Strict overlap: s1 starts before s2 ends AND s1 ends after s2 starts.
  // Adjacent periods (s1.end === s2.start) are NOT overlapping.
  return s1Start < s2End && s1End > s2Start
}

function getSubjectColor(subjectName) {
  const colorMap = {
    Mathematics: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
    Science: { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
    Physics: { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6' },
    Chemistry: { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' },
    Biology: { bg: '#ccfbf1', border: '#14b8a6', text: '#134e4a' },
    English: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
    Filipino: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    History: { bg: '#f3e8ff', border: '#a855f7', text: '#6b21a8' },
    'Araling Panlipunan': { bg: '#cffafe', border: '#06b6d4', text: '#164e63' },
    'Physical Education': { bg: '#ecfccb', border: '#84cc16', text: '#365314' },
    Arts: { bg: '#ffedd5', border: '#f97316', text: '#9a3412' },
    Music: { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' },
    Computer: { bg: '#e0e7ff', border: '#6366f1', text: '#312e81' },
    TLE: { bg: '#ccfbf1', border: '#14b8a6', text: '#134e4a' },
  }
  for (const [key, value] of Object.entries(colorMap)) {
    if (subjectName?.toLowerCase().includes(key.toLowerCase())) return value
  }
  return { bg: '#f1f5f9', border: '#64748b', text: '#334155' }
}

function detectConflicts(schedules) {
  const conflicts = []
  const seen = new Set()
  for (let i = 0; i < schedules.length; i++) {
    for (let j = i + 1; j < schedules.length; j++) {
      const s1 = schedules[i]
      const s2 = schedules[j]
      if (s1.id === s2.id) continue
      if (!schedulesOverlap(s1, s2)) continue
      const key = `${Math.min(s1.id, s2.id)}-${Math.max(s1.id, s2.id)}`
      if (seen.has(key)) continue
      seen.add(key)
      const reasons = []
      const d1 = s1.teacher_assignment_detail
      const d2 = s2.teacher_assignment_detail
      if (d1?.teacher_id && d2?.teacher_id && d1.teacher_id === d2.teacher_id) {
        reasons.push({ type: 'teacher', message: `${d1.teacher_name} is double-booked at this time`, severity: 'high' })
      }
      if (d1?.section_id && d2?.section_id && d1.section_id === d2.section_id) {
        reasons.push({ type: 'section', message: `${d1.section_name} has two overlapping classes`, severity: 'high' })
      }
      if (s1.room && s2.room && s1.room.trim().toLowerCase() === s2.room.trim().toLowerCase()) {
        reasons.push({ type: 'room', message: `Room ${s1.room} is double-booked`, severity: 'medium' })
      }
      if (reasons.length > 0) {
        const dayLabel = DAYS_OF_WEEK.find((d) => d.value === s1.day_of_week)?.label || '—'
        conflicts.push({
          id: `${s1.id}-${s2.id}`,
          schedules: [s1, s2],
          reasons,
          day: s1.day_of_week,
          dayLabel,
          time: `${normTime(s1.start_time)}–${normTime(s1.end_time)}`,
        })
      }
    }
  }
  return conflicts
}

/**
 * Group conflicts by day and time for clearer presentation.
 * Returns an array of grouped conflicts, each containing:
 * - day, dayLabel, time
 * - conflicts: array of individual conflict objects (each with schedules, reasons)
 * - summary: counts by type (teacher, section, room)
 */
function groupConflicts(conflicts) {
  const groups = new Map()
  
  conflicts.forEach((conflict) => {
    const key = `${conflict.day}-${conflict.time}`
    if (!groups.has(key)) {
      groups.set(key, {
        day: conflict.day,
        dayLabel: conflict.dayLabel,
        time: conflict.time,
        conflicts: [],
        summary: { teacher: 0, section: 0, room: 0 },
      })
    }
    const group = groups.get(key)
    group.conflicts.push(conflict)
    conflict.reasons.forEach((r) => {
      if (group.summary[r.type] !== undefined) {
        group.summary[r.type]++
      }
    })
  })
  
  // Sort groups by day then time
  return Array.from(groups.values()).sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day
    return a.time.localeCompare(b.time)
  })
}

function ScheduleCard({ schedule, onClick, onEdit, onDelete, hasConflict, conflictReasons }) {
  const detail = schedule.teacher_assignment_detail
  const colors = getSubjectColor(detail?.subject_name || '')
  const tooltip = conflictReasons.length > 0 ? conflictReasons.join('; ') : ''
  const [showMenu, setShowMenu] = useState(false)
  
  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (showMenu && !event.target.closest('.timetable-card-menu')) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

  return (
    <div className="timetable-card-wrapper">
      <button
        type="button"
        className={`timetable-card${hasConflict ? ' has-conflict' : ''}`}
        onClick={() => onClick(schedule)}
        style={{ background: colors.bg, borderColor: colors.border }}
        title={[detail?.subject_name, detail?.section_name, detail?.teacher_name, normTime(schedule.start_time) + '–' + normTime(schedule.end_time), schedule.room].filter(Boolean).join(' · ')}
      >
        <span className="timetable-card-subject" style={{ color: colors.text }}>{detail?.subject_name}</span>
        <span className="timetable-card-section" style={{ color: colors.text }}>{detail?.section_name}</span>
        <span className="timetable-card-time" style={{ color: colors.text }}>{normTime(schedule.start_time)}–{normTime(schedule.end_time)}</span>
        {detail?.teacher_name && <span className="timetable-card-teacher" style={{ color: colors.text }}>{detail.teacher_name}</span>}
        {schedule.room && <span className="timetable-card-room" style={{ color: colors.text }}><Icon name="mapPin" size={10} aria-hidden="true" />{schedule.room}</span>}
        {hasConflict && <span className="timetable-card-warn" aria-label={`Scheduling conflict: ${tooltip}`} data-tooltip={tooltip}>!</span>}
      </button>
      <div className="timetable-card-menu" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="timetable-card-menu-trigger"
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
          aria-expanded={showMenu}
          aria-haspopup="true"
          aria-label="Schedule actions"
          title="Actions"
        >
          <Icon name="moreVertical" size={16} />
        </button>
        {showMenu && (
          <div className="timetable-card-dropdown">
            <button
              type="button"
              className="timetable-card-dropdown-item"
              onClick={(e) => { e.stopPropagation(); setShowMenu(false); onEdit(schedule) }}
            >
              <Icon name="pencil" size={14} />
              Edit
            </button>
            <button
              type="button"
              className="timetable-card-dropdown-item danger"
              onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDelete(schedule) }}
            >
              <Icon name="trash" size={14} />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function TimetableGrid({ schedules, onScheduleClick, onEdit, onDelete, conflicts }) {
  const todayDoW = useMemo(getTodayDayOfWeek, [])

  const periods = useMemo(() => generatePeriodGrid(schedules), [schedules])

  // Group schedules by day and by the period in which they START.
  // Multiple schedules can share the same period (e.g., different sections
  // at the same time). They are rendered as stacked cards inside the cell.
  // rowSpan is used to merge a schedule across consecutive periods it covers.
  const layoutByDay = useMemo(() => {
    const byDay = {}
    DAYS_OF_WEEK.forEach((day) => {
      const daySchedules = schedules
        .filter((s) => s.day_of_week === day.value)
        .sort((a, b) => a.start_time.localeCompare(b.start_time) || a.id - b.id)

      // For each period, which schedules start here, and which are "covered"
      // by a rowspan from a schedule that started earlier.
      const startingHere = {} // periodIndex -> [schedule, ...]
      const coveredBy = new Array(periods.length).fill(null) // periodIndex -> scheduleId or null

      daySchedules.forEach((schedule) => {
        const sStart = timeToMinutes(normTime(schedule.start_time))
        const sEnd = timeToMinutes(normTime(schedule.end_time))
        // Find the first period whose start matches the schedule's start
        let firstIdx = -1
        for (let i = 0; i < periods.length; i++) {
          if (periods[i].startMin === sStart) {
            firstIdx = i
            break
          }
          if (periods[i].startMin < sStart && periods[i].endMin > sStart) {
            firstIdx = i
            break
          }
        }
        if (firstIdx === -1) return
        // Count consecutive periods this schedule spans
        let span = 0
        for (let i = firstIdx; i < periods.length; i++) {
          if (periods[i].startMin >= sStart && periods[i].endMin <= sEnd) {
            span++
            coveredBy[i] = schedule.id
          } else break
        }
        if (span > 0) {
          if (!startingHere[firstIdx]) startingHere[firstIdx] = []
          startingHere[firstIdx].push({ schedule, span })
        }
      })

      byDay[day.value] = { startingHere, coveredBy }
    })
    return byDay
  }, [schedules, periods])

  const conflictMap = useMemo(() => {
    const map = new Set()
    conflicts.forEach((c) => c.schedules.forEach((s) => map.add(s.id)))
    return map
  }, [conflicts])

  const reasonsBySchedule = useMemo(() => {
    const m = new Map()
    conflicts.forEach((c) => {
      c.schedules.forEach((s) => {
        if (!m.has(s.id)) m.set(s.id, [])
        m.get(s.id).push(...c.reasons.map((r) => r.message))
      })
    })
    return m
  }, [conflicts])

  if (periods.length === 0) {
    return (
      <div className="timetable-empty">
        <EmptyState
          icon="calendar"
          title="No periods to display"
          message="Add schedules with start and end times to see the weekly timetable."
        />
      </div>
    )
  }

  return (
    <div className="timetable-table-container" role="region" aria-label="Weekly timetable">
      <table className="timetable-table">
        <colgroup>
          <col className="time-col" />
          {DAYS_OF_WEEK.map((day) => (
            <col key={day.value} className="day-col" />
          ))}
        </colgroup>
        <thead>
          <tr className="timetable-header-row">
            <th className="timetable-th time-col" scope="col">Time</th>
            {DAYS_OF_WEEK.map((day) => (
              <th
                key={day.value}
                className={`timetable-th${day.value === todayDoW ? ' is-today' : ''}`}
                scope="col"
              >
                <span className="timetable-day-label">{day.label}</span>
                {day.value === todayDoW && <span className="timetable-today-badge">Today</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period, periodIndex) => (
            <tr key={periodIndex} className="timetable-row">
              <td className="timetable-time-td">
                <span className="timetable-period-num">P{period.index}</span>
                <span className="timetable-time-range">{period.start}–{period.end}</span>
              </td>
              {DAYS_OF_WEEK.map((day) => {
                const dayData = layoutByDay[day.value]
                if (!dayData) {
                  return <td key={day.value} className={`timetable-td empty${day.value === todayDoW ? ' is-today' : ''}`} />
                }
                // Schedules that START at this period
                const starting = dayData.startingHere[periodIndex] || []
                if (starting.length > 0) {
                  // For multiple schedules in the same period, we cannot use rowSpan
                  // (table cells can't both rowspan and stack). Instead render them
                  // stacked inside the cell. rowSpan only applies when there's a single
                  // schedule that spans multiple periods.
                  if (starting.length === 1 && starting[0].span > 1) {
                    const { schedule, span } = starting[0]
                    const hasConflict = conflictMap.has(schedule.id)
                    const reasons = reasonsBySchedule.get(schedule.id) || []
                    return (
                      <td
                        key={day.value}
                        className={`timetable-td occupied${day.value === todayDoW ? ' is-today' : ''}`}
                        rowSpan={span}
                      >
                        <ScheduleCard
                          schedule={schedule}
                          onClick={onScheduleClick}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          hasConflict={hasConflict}
                          conflictReasons={reasons}
                        />
                      </td>
                    )
                  }
                  // Multiple schedules (or single-period): render stacked, no rowspan
                  return (
                    <td
                      key={day.value}
                      className={`timetable-td occupied stacked${day.value === todayDoW ? ' is-today' : ''}`}
                    >
                      <div className="timetable-stack">
                        {starting.map(({ schedule }) => {
                          const hasConflict = conflictMap.has(schedule.id)
                          const reasons = reasonsBySchedule.get(schedule.id) || []
                          return (
                            <ScheduleCard
                              key={schedule.id}
                              schedule={schedule}
                              onClick={onScheduleClick}
                              onEdit={onEdit}
                              onDelete={onDelete}
                              hasConflict={hasConflict}
                              conflictReasons={reasons}
                            />
                          )
                        })}
                      </div>
                    </td>
                  )
                }
                // Is this period covered by a rowspan from above?
                if (dayData.coveredBy[periodIndex] !== null) {
                  return null // browser handles the rowspan
                }
                return <td key={day.value} className={`timetable-td empty${day.value === todayDoW ? ' is-today' : ''}`} />
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function getTodayDayOfWeek() {
  const weekdayName = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Manila' }).format(new Date())
  const dayMap = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return dayMap[weekdayName] ?? new Date().getDay()
}

function SummaryCards({ schedules, onConflictClick }) {
  const stats = useMemo(() => {
    const weekdayName = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Manila' }).format(new Date())
    const dayMap = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    const todayDoW = dayMap[weekdayName] ?? new Date().getDay()
    const todaySchedules = schedules.filter((s) => s.day_of_week === todayDoW)
    const teachers = new Set(); schedules.forEach((s) => { if (s.teacher_assignment) teachers.add(s.teacher_assignment) })
    const conflicts = detectConflicts(schedules)
    return { total: schedules.length, today: todaySchedules.length, teachers: teachers.size, conflicts: conflicts.length }
  }, [schedules])
  const hasConflicts = stats.conflicts > 0
  return (
    <div className="sched-summary">
      <div className="sched-summary-card"><div className="sched-summary-icon" style={{ background: 'var(--navy-100)' }}><Icon name="calendar" size={20} style={{ color: 'var(--navy-700)' }} /></div><div className="sched-summary-body"><div className="sched-summary-value">{stats.total}</div><div className="sched-summary-label">Scheduled Periods</div></div></div>
      <div className="sched-summary-card"><div className="sched-summary-icon" style={{ background: 'var(--cyan-100)' }}><Icon name="clock" size={20} style={{ color: 'var(--cyan-700)' }} /></div><div className="sched-summary-body"><div className="sched-summary-value">{stats.today}</div><div className="sched-summary-label">Classes Today</div></div></div>
      <div className="sched-summary-card"><div className="sched-summary-icon" style={{ background: 'var(--blue-100)' }}><Icon name="users" size={20} style={{ color: 'var(--blue-700)' }} /></div><div className="sched-summary-body"><div className="sched-summary-value">{stats.teachers}</div><div className="sched-summary-label">Teachers with Schedules</div></div></div>
      <button type="button" className={`sched-summary-card is-clickable${hasConflicts ? ' has-warning' : ''}`} onClick={hasConflicts ? onConflictClick : undefined} disabled={!hasConflicts} aria-label={hasConflicts ? `${stats.conflicts} scheduling conflict${stats.conflicts === 1 ? '' : 's'} — click to review` : 'No scheduling conflicts'} title={hasConflicts ? 'Click to review conflicts' : undefined}><div className="sched-summary-icon" style={{ background: hasConflicts ? 'var(--red-100)' : 'var(--green-100)' }}><Icon name={hasConflicts ? 'alertTriangle' : 'check'} size={20} style={{ color: hasConflicts ? 'var(--red-700)' : 'var(--green-700)' }} /></div><div className="sched-summary-body"><div className="sched-summary-value">{stats.conflicts}</div><div className="sched-summary-label">Scheduling Conflicts</div></div></button>
    </div>
  )
}

function ConflictPanel({ conflicts, onScheduleClick, onClose }) {
  if (!conflicts || conflicts.length === 0) return null
  
  const grouped = groupConflicts(conflicts)
  const totalPairs = conflicts.length
  
  return (
    <section className="sched-conflict-panel">
      <header>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <Icon name="alertTriangle" size={18} style={{ color: 'var(--red-700)' }} />
          <h3 style={{ margin: 0, fontSize: '1rem' }}>
            {totalPairs} Scheduling Conflict{totalPairs === 1 ? '' : 's'} across {grouped.length} time slot{grouped.length === 1 ? '' : 's'}
          </h3>
        </div>
        {onClose && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close conflict panel">
            <Icon name="close" size={14} />
          </button>
        )}
      </header>
      <div className="sched-conflict-list">
        {grouped.map((group) => (
          <div className="sched-conflict-group" key={`${group.day}-${group.time}`}>
            <div className="sched-conflict-group-header">
              <span className="sched-conflict-daytime">{group.dayLabel} · {group.time}</span>
              <div className="sched-conflict-summary-tags">
                {group.summary.teacher > 0 && (
                  <span className="sched-conflict-reason high" title={`${group.summary.teacher} teacher conflict${group.summary.teacher > 1 ? 's' : ''}`}>
                    ⚠ {group.summary.teacher} teacher
                  </span>
                )}
                {group.summary.section > 0 && (
                  <span className="sched-conflict-reason high" title={`${group.summary.section} section conflict${group.summary.section > 1 ? 's' : ''}`}>
                    ⚠ {group.summary.section} section
                  </span>
                )}
                {group.summary.room > 0 && (
                  <span className="sched-conflict-reason medium" title={`${group.summary.room} room conflict${group.summary.room > 1 ? 's' : ''}`}>
                    ℹ {group.summary.room} room
                  </span>
                )}
              </div>
            </div>
            <div className="sched-conflict-pairs">
              {group.conflicts.map((conflict, cidx) => {
                const [s1, s2] = conflict.schedules
                const d1 = s1.teacher_assignment_detail
                const d2 = s2.teacher_assignment_detail
                return (
                  <div className="sched-conflict-pair-item" key={conflict.id}>
                    <div className="sched-conflict-pair">
                      <button
                        type="button"
                        className="sched-conflict-side"
                        onClick={() => onScheduleClick(s1)}
                        title="View schedule details"
                      >
                        <div className="subject">{d1?.subject_name}</div>
                        <div className="meta">{d1?.section_name}</div>
                        <div className="meta">{d1?.teacher_name}{s1.room ? ` · ${s1.room}` : ''}</div>
                      </button>
                      <span className="sched-conflict-vs" aria-hidden="true">
                        <Icon name="x" size={14} style={{ color: 'var(--red-600)' }} />
                      </span>
                      <button
                        type="button"
                        className="sched-conflict-side"
                        onClick={() => onScheduleClick(s2)}
                        title="View schedule details"
                      >
                        <div className="subject">{d2?.subject_name}</div>
                        <div className="meta">{d2?.section_name}</div>
                        <div className="meta">{d2?.teacher_name}{s2.room ? ` · ${s2.room}` : ''}</div>
                      </button>
                    </div>
                    <div className="sched-conflict-reasons-detail">
                      {conflict.reasons.map((reason, ridx) => (
                        <div key={ridx} className={`sched-conflict-reason-detail ${reason.severity}`}>
                          {reason.severity === 'high' ? '⚠ ' : 'ℹ '}
                          {reason.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ScheduleDetailPanel({ schedule, onClose, onEdit, onDelete }) {
  if (!schedule) return null
  const detail = schedule.teacher_assignment_detail
  return (<Modal open title="Schedule Details" onClose={onClose} width={500} footer={<><button type="button" className="btn btn-danger btn-sm" onClick={() => onDelete(schedule)}><Icon name="trash" size={14} />Delete</button><span className="grow" /><button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Close</button><button type="button" className="btn btn-primary btn-sm" onClick={() => onEdit(schedule)}><Icon name="pencil" size={14} />Edit</button></>}><div className="stack stack-sm"><div><div className="label">Subject</div><div className="value"><strong>{detail?.subject_name}</strong></div></div><div><div className="label">Class / Section</div><div className="value">{detail?.section_name}</div></div><div className="row row-wrap" style={{ gap: 16 }}><div style={{ flex: 1, minWidth: '120px' }}><div className="label">Day</div><div className="value">{schedule.day_of_week_display}</div></div><div style={{ flex: 1, minWidth: '120px' }}><div className="label">Time</div><div className="value">{normTime(schedule.start_time)} - {normTime(schedule.end_time)}</div></div></div><div><div className="label">Room</div><div className="value">{schedule.room || <span className="subtle">Not specified</span>}</div></div></div></Modal>)
}

function ScheduleFormModal({ schedule, onClose, onSaved, existingSchedules = [] }) {
  const [assignment, setAssignment] = useState(schedule?.teacher_assignment || '')
  const [dayOfWeek, setDayOfWeek] = useState(schedule?.day_of_week || '')
  const [startTime, setStartTime] = useState(normTime(schedule?.start_time) || '')
  const [endTime, setEndTime] = useState(normTime(schedule?.end_time) || '')
  const [room, setRoom] = useState(schedule?.room || '')
  const [error, setError] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [busy, setBusy] = useState(false)
  const assignments = useFetch('/teacher-assignments/', { list: true })
  const isEdit = Boolean(schedule)
  function checkConflicts() { if (!assignment || !dayOfWeek || !startTime || !endTime) { setWarnings([]); return } const conflicts = []; const tempSchedule = { id: schedule?.id || -1, day_of_week: Number(dayOfWeek), start_time: startTime, end_time: endTime, room: room.trim(), teacher_assignment_detail: assignments.data?.find((a) => a.id === Number(assignment)) }; existingSchedules.forEach((existing) => { if (existing.id === tempSchedule.id) return; if (schedulesOverlap(tempSchedule, existing)) { const d1 = tempSchedule.teacher_assignment_detail, d2 = existing.teacher_assignment_detail; if (d1?.teacher_id === d2?.teacher_id) conflicts.push({ type: 'error', message: `${d1.teacher_name} already teaches ${d2.subject_name} (${d2.section_name}) at this time` }); if (d1?.section_id === d2?.section_id) conflicts.push({ type: 'error', message: `${d1.section_name} already has ${d2.subject_name} scheduled at this time` }); if (existing.room && tempSchedule.room && existing.room.toLowerCase() === tempSchedule.room.toLowerCase()) conflicts.push({ type: 'warning', message: `Room ${existing.room} is already booked for ${d2.subject_name} (${d2.section_name})` }) }}); setWarnings(conflicts) }
  const duration = useMemo(() => { if (!startTime || !endTime) return null; const start = new Date(`2000-01-01T${startTime}`), end = new Date(`2000-01-01T${endTime}`); const diffMins = Math.floor((end - start) / 60000); if (diffMins <= 0) return { valid: false, message: 'End time must be after start time' }; if (diffMins < 30) return { valid: true, warning: 'Class is less than 30 minutes' }; if (diffMins > 180) return { valid: true, warning: 'Class is more than 3 hours' }; return { valid: true, duration: `${diffMins} minutes` } }, [startTime, endTime])
  const hasErrors = warnings.some((w) => w.type === 'error') || (duration && !duration.valid)
  function handleSubmit(e) { e.preventDefault(); if (busy) return; setError(null); if (!assignment) { setError('Please select a class and subject.'); return } if (!dayOfWeek) { setError('Please select a day of week.'); return } if (!startTime || !endTime) { setError('Please enter start and end times.'); return } if (startTime >= endTime) { setError('End time must be after start time.'); return } if (hasErrors) { setError('Please resolve all conflicts before saving.'); return } setBusy(true); const payload = { teacher_assignment: Number(assignment), day_of_week: Number(dayOfWeek), start_time: startTime, end_time: endTime, room: room.trim() }; const request = isEdit ? api.patch(`/schedules/${schedule.id}/`, payload) : api.post('/schedules/', payload); request.then((saved) => { onSaved(saved); onClose() }).catch((err) => { setError(err.message) }).finally(() => { setBusy(false) }) }
  useEffect(() => { if (assignment && dayOfWeek && startTime && endTime) { const timer = setTimeout(checkConflicts, 300); return () => clearTimeout(timer) } else setWarnings([]) }, [assignment, dayOfWeek, startTime, endTime, room])
  return (
    <Modal
      open
      title={isEdit ? 'Edit Class Schedule' : 'Add Schedule'}
      onClose={busy ? undefined : onClose}
      dismissible={!busy}
      width={560}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={busy || hasErrors} title={hasErrors ? 'Resolve conflicts before saving' : ''}>
            {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
            {busy ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Schedule'}
          </button>
        </>
      }
    >
      <form className="stack stack-sm" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="schedule-assignment">Class and Subject <span style={{ color: 'var(--red-700)' }}>*</span></label>
          <select id="schedule-assignment" className="select" value={assignment} onChange={(e) => setAssignment(e.target.value)} disabled={busy || assignments.loading} required>
            <option value="">Select a class…</option>
            {(assignments.data || []).map((a) => (
              <option key={a.id} value={a.id}>{a.teacher_name} — {a.subject_name} — {a.section_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="schedule-day">Day of Week <span style={{ color: 'var(--red-700)' }}>*</span></label>
          <select id="schedule-day" className="select" value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} disabled={busy} required>
            <option value="">Select a day…</option>
            {DAYS_OF_WEEK.map((day) => (
              <option key={day.value} value={day.value}>{day.label}</option>
            ))}
          </select>
        </div>
        <div className="row row-wrap" style={{ gap: 12 }}>
          <div className="field" style={{ flex: 1, minWidth: '140px' }}>
            <label htmlFor="schedule-start">Start Time <span style={{ color: 'var(--red-700)' }}>*</span></label>
            <input id="schedule-start" className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={busy} required />
          </div>
          <div className="field" style={{ flex: 1, minWidth: '140px' }}>
            <label htmlFor="schedule-end">End Time <span style={{ color: 'var(--red-700)' }}>*</span></label>
            <input id="schedule-end" className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} disabled={busy} required />
          </div>
        </div>
        {duration && duration.valid && duration.duration && !duration.warning && (
          <div className="alert" style={{ background: 'var(--blue-50)', border: '1px solid var(--blue-200)', color: 'var(--blue-900)' }}>
            <Icon name="clock" size={15} />
            <span>Class duration: {duration.duration}</span>
          </div>
        )}
        {duration && duration.warning && (
          <div className="alert alert-warning">
            <Icon name="info" size={15} />
            <span>{duration.warning}</span>
          </div>
        )}
        {duration && !duration.valid && (
          <div className="alert alert-error">
            <Icon name="alertTriangle" size={15} />
            <span>{duration.message}</span>
          </div>
        )}
        <div className="field">
          <label htmlFor="schedule-room">Room</label>
          <input id="schedule-room" className="input" type="text" list="room-suggestions" value={room} onChange={(e) => setRoom(e.target.value)} disabled={busy} placeholder="e.g., Room 101, Science Lab" maxLength={50} />
          <datalist id="room-suggestions">
            <option value="Room 101" />
            <option value="Room 102" />
            <option value="Room 103" />
            <option value="Science Lab" />
            <option value="Computer Lab" />
            <option value="Library" />
            <option value="Gymnasium" />
          </datalist>
          <p className="hint">Optional. Start typing to see suggestions.</p>
        </div>
        {warnings.length > 0 && (
          <div className="stack stack-xs">
            {warnings.map((warning, idx) => (
              <div key={idx} className={`alert alert-${warning.type === 'error' ? 'error' : 'warning'}`}>
                <Icon name={warning.type === 'error' ? 'x' : 'alertTriangle'} size={15} />
                <span>{warning.message}</span>
              </div>
            ))}
          </div>
        )}
        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="info" size={15} />
            <span>{error}</span>
          </div>
        )}
      </form>
    </Modal>
  )
}

function ConfirmDeleteModal({ schedule, onClose, onDeleted, busy }) {
  return (
    <Modal
      open
      title="Delete Schedule?"
      onClose={busy ? undefined : onClose}
      dismissible={!busy}
      width={460}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-danger btn-sm" onClick={onDeleted} disabled={busy}>
            {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
            {busy ? 'Deleting…' : 'Delete Schedule'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ fontSize: '0.92rem', marginBottom: '12px' }}>
        Are you sure you want to delete this class schedule?
      </p>
      <div className="card" style={{ background: 'var(--surface-2)' }}>
        <div className="card-body" style={{ fontSize: '0.9rem' }}>
          <p style={{ margin: 0 }}>
            <strong>{schedule?.teacher_assignment_detail?.subject_name}</strong>
            <br />
            {schedule?.teacher_assignment_detail?.section_name}
            <br />
            <span className="muted">
              {schedule?.day_of_week_display} {normTime(schedule?.start_time)} - {normTime(schedule?.end_time)}
              {schedule?.room && ` · ${schedule.room}`}
            </span>
          </p>
        </div>
      </div>
      <p className="muted" style={{ fontSize: '0.85rem', marginTop: '12px' }}>
        Past attendance sessions will be preserved, but new sessions will no longer
        be generated for this time slot.
      </p>
    </Modal>
  )
}

function UndoToast({ toast, onUndo, onDismiss }) {
  if (!toast) return null
  const { schedule, timeoutId } = toast
  return (
    <div className="sched-undo-toast" role="alert" aria-live="polite">
      <div className="sched-undo-toast-inner">
        <Icon name="checkCircle" size={20} style={{ color: 'var(--green-600)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--navy-900)' }}>
            Schedule deleted
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
            <strong>{schedule.teacher_assignment_detail?.subject_name}</strong> —{' '}
            {schedule.teacher_assignment_detail?.section_name}{' '}
            {normTime(schedule.start_time)}–{normTime(schedule.end_time)}
            {schedule.room ? ` · ${schedule.room}` : ''}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            if (timeoutId) clearTimeout(timeoutId)
            onUndo()
          }}
          style={{ flexShrink: 0, minWidth: 80 }}
        >
          <Icon name="rotateCcw" size={14} style={{ marginRight: 4 }} />
          Undo
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            if (timeoutId) clearTimeout(timeoutId)
            onDismiss()
          }}
          style={{ flexShrink: 0, padding: '6px 8px' }}
          aria-label="Dismiss"
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  )
}

export default function SchedulesPage() {
  const [nonce, setNonce] = useState(0)
  const [view, setView] = useState('timetable')
  const [formOpen, setFormOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(null)
  const [selectedSchedule, setSelectedSchedule] = useState(null)
  const [deletingSchedule, setDeletingSchedule] = useState(null)
  const [deleteError, setDeleteError] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [conflictPanelOpen, setConflictPanelOpen] = useState(false)
  const [filterTeacher, setFilterTeacher] = useState('')
  const [filterSection, setFilterSection] = useState('')
  const [filterSubject, setFilterSubject] = useState('')
  const [filterDay, setFilterDay] = useState('')

  const schedules = useFetch('/schedules/', { list: true, deps: [nonce] })
  const assignments = useFetch('/teacher-assignments/', { list: true })

  function refresh() {
    setNonce((n) => n + 1)
  }

  const allSchedules = useMemo(() => schedules.data || [], [schedules.data])

  const allConflicts = useMemo(() => detectConflicts(allSchedules), [allSchedules])

  const filterOptions = useMemo(() => {
    const teachers = new Map()
    const sections = new Set()
    const subjects = new Set()

    ;(assignments.data || []).forEach((a) => {
      if (!teachers.has(a.teacher)) {
        teachers.set(a.teacher, a.teacher_name)
      }
      sections.add(a.section_name)
      subjects.add(a.subject_name)
    })

    return {
      teachers: Array.from(teachers.entries()).map(([id, name]) => ({ id, name })),
      sections: Array.from(sections).sort(),
      subjects: Array.from(subjects).sort(),
    }
  }, [assignments.data])

  const filteredSchedules = useMemo(() => {
    let filtered = allSchedules

    if (filterTeacher) {
      filtered = filtered.filter((s) => s.teacher_assignment === Number(filterTeacher))
    }

    if (filterSection) {
      filtered = filtered.filter(
        (s) => s.teacher_assignment_detail?.section_name === filterSection
      )
    }

    if (filterSubject) {
      filtered = filtered.filter(
        (s) => s.teacher_assignment_detail?.subject_name === filterSubject
      )
    }

    if (filterDay) {
      filtered = filtered.filter((s) => s.day_of_week === Number(filterDay))
    }

    return filtered
  }, [allSchedules, filterTeacher, filterSection, filterSubject, filterDay])

  const groupedSchedules = useMemo(() => {
    const groups = new Map()

    filteredSchedules.forEach((schedule) => {
      const key = schedule.teacher_assignment
      if (!groups.has(key)) {
        groups.set(key, {
          assignment: schedule.teacher_assignment_detail,
          schedules: [],
        })
      }
      groups.get(key).schedules.push(schedule)
    })

    const result = Array.from(groups.values())
    result.forEach((group) => {
      group.schedules.sort((a, b) => {
        if (a.day_of_week !== b.day_of_week) {
          return a.day_of_week - b.day_of_week
        }
        return a.start_time.localeCompare(b.start_time)
      })
    })

    return result
  }, [filteredSchedules])

  function handleScheduleClick(schedule) {
    setSelectedSchedule(schedule)
  }

  function handleEdit(schedule) {
    setSelectedSchedule(null)
    setEditingSchedule(schedule)
  }

  function handleDelete() {
    if (!deletingSchedule || deleting) return

    const scheduleToDelete = deletingSchedule

    setDeleting(true)
    setDeleteError(null)

    api
      .delete(`/schedules/${scheduleToDelete.id}/`)
      .then(() => {
        setDeletingSchedule(null)
        setSelectedSchedule(null)

        const timerId = setTimeout(() => {
          refresh()
          setUndoToast(null)
        }, 5000)

        setUndoToast({
          schedule: scheduleToDelete,
          timeoutId: timerId,
        })
      })
      .catch((err) => {
        setDeleteError(err.message)
      })
      .finally(() => {
        setDeleting(false)
      })
  }

  function handleUndo() {
    if (!undoToast) return

    const { schedule, timeoutId } = undoToast

    if (timeoutId) clearTimeout(timeoutId)

    const payload = {
      teacher_assignment: schedule.teacher_assignment,
      day_of_week: schedule.day_of_week,
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      room: schedule.room || '',
    }

    setDeleting(true)

    api
      .post('/schedules/', payload)
      .then(() => {
        setUndoToast(null)
        refresh()
      })
      .catch((err) => {
        setDeleteError(err.message)
        setUndoToast(null)
      })
      .finally(() => {
        setDeleting(false)
      })
  }

  function dismissUndo() {
    if (undoToast?.timeoutId) clearTimeout(undoToast.timeoutId)
    setUndoToast(null)
    refresh()
  }

  const hasFilters = Boolean(filterTeacher || filterSection || filterSubject || filterDay)

  const [undoToast, setUndoToast] = useState(null)
  const undoTimerRef = useRef(null)

  const weekLabel = useMemo(() => {
    const today = new Date()
    const dayOfWeekJS = today.getDay()
    const mondayOffset = dayOfWeekJS === 0 ? -6 : 1 - dayOfWeekJS
    const monday = new Date(today)
    monday.setDate(today.getDate() + mondayOffset)
    const friday = new Date(monday)
    friday.setDate(monday.getDate() + 4)

    const fmt = (d) =>
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmt(monday)} – ${fmt(friday)}, ${friday.getFullYear()}`
  }, [])

  return (
    <>
      <PageHeader
        title="Class Schedules"
        subtitle="Manage weekly class schedules and prevent timetable conflicts"
      />

      <div className="stack stack-md">
        <SummaryCards
          schedules={allSchedules}
          onConflictClick={() => setConflictPanelOpen(true)}
        />

        {conflictPanelOpen && allConflicts.length > 0 && (
          <ConflictPanel
            conflicts={allConflicts}
            onScheduleClick={handleScheduleClick}
            onClose={() => setConflictPanelOpen(false)}
          />
        )}

        <div className="sched-toolbar">
          <div className="sched-toolbar-left">
            <div className="sched-week-label">
              <Icon name="calendar" size={16} aria-hidden="true" />
              <span>This week</span>
              <span className="subtle">· {weekLabel}</span>
            </div>
            <span
              className="badge badge-neutral"
              title="The timetable shows recurring weekly classes — not one-off events"
            >
              Recurring
            </span>
          </div>

          <div className="sched-toolbar-right">
            <div className="btn-group" role="group" aria-label="View mode">
              <button
                type="button"
                className={`btn btn-sm ${view === 'timetable' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setView('timetable')}
                aria-pressed={view === 'timetable'}
              >
                <Icon name="grid" size={14} />
                Timetable
              </button>
              <button
                type="button"
                className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setView('list')}
                aria-pressed={view === 'list'}
              >
                <Icon name="list" size={14} />
                List
              </button>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setFormOpen(true)}
              disabled={schedules.loading}
            >
              <Icon name="plus" size={15} />
              Add Schedule
            </button>
          </div>
        </div>

        <div className="sched-filters">
          <div className="field">
            <label htmlFor="filter-teacher" className="sr-only">Filter by teacher</label>
            <select
              id="filter-teacher"
              className="select select-sm"
              value={filterTeacher}
              onChange={(e) => setFilterTeacher(e.target.value)}
              disabled={schedules.loading}
            >
              <option value="">All teachers</option>
              {filterOptions.teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="filter-section" className="sr-only">Filter by section</label>
            <select
              id="filter-section"
              className="select select-sm"
              value={filterSection}
              onChange={(e) => setFilterSection(e.target.value)}
              disabled={schedules.loading}
            >
              <option value="">All sections</option>
              {filterOptions.sections.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="filter-subject" className="sr-only">Filter by subject</label>
            <select
              id="filter-subject"
              className="select select-sm"
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              disabled={schedules.loading}
            >
              <option value="">All subjects</option>
              {filterOptions.subjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="filter-day" className="sr-only">Filter by day</label>
            <select
              id="filter-day"
              className="select select-sm"
              value={filterDay}
              onChange={(e) => setFilterDay(e.target.value)}
              disabled={schedules.loading}
            >
              <option value="">All days</option>
              {DAYS_OF_WEEK.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </div>

          {hasFilters && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setFilterTeacher('')
                setFilterSection('')
                setFilterSubject('')
                setFilterDay('')
              }}
            >
              <Icon name="close" size={14} />
              Clear
            </button>
          )}
        </div>

        <section className="sched-timetable-card">
          {schedules.loading && !schedules.data && (
            <div style={{ padding: 32 }}>
              <LoadingSpinner block label="Loading schedules…" />
            </div>
          )}

          {schedules.error && (
            <div style={{ padding: 24 }}>
              <ErrorMessage
                error={schedules.error}
                title="Could not load schedules"
                onRetry={schedules.reload}
              />
            </div>
          )}

          {!schedules.loading && !schedules.error && allSchedules.length === 0 && (
            <div style={{ padding: 32 }}>
              <EmptyState
                icon="calendar"
                title="No schedules configured"
                message="Add your first class schedule to start building the weekly timetable."
              />
            </div>
          )}

          {!schedules.loading &&
            !schedules.error &&
            allSchedules.length > 0 &&
            filteredSchedules.length === 0 && (
              <div style={{ padding: 32 }}>
                <EmptyState
                  icon="search"
                  title="No matching schedules"
                  message="No schedules match your current filters. Try adjusting or clearing them."
                />
              </div>
            )}

          {!schedules.loading &&
            !schedules.error &&
            filteredSchedules.length > 0 &&
            view === 'timetable' && (
              <TimetableGrid
                schedules={filteredSchedules}
                conflicts={allConflicts}
                onScheduleClick={handleScheduleClick}
                onEdit={handleEdit}
                onDelete={(schedule) => {
                  setSelectedSchedule(null)
                  setDeletingSchedule(schedule)
                }}
              />
            )}

          {!schedules.loading &&
            !schedules.error &&
            filteredSchedules.length > 0 &&
            view === 'list' && (
              <div className="stack stack-sm" style={{ padding: 0 }}>
                {groupedSchedules.map((group, idx) => (
                  <div
                    key={group.assignment.id}
                    style={{
                      borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
                      padding: '16px',
                    }}
                  >
                    <div style={{ marginBottom: '12px' }}>
                      <h3
                        style={{
                          fontSize: '1rem',
                          fontWeight: 600,
                          margin: 0,
                          marginBottom: '4px',
                        }}
                      >
                        {group.assignment.subject_name}
                      </h3>
                      <p className="subtle" style={{ fontSize: '0.9rem', margin: 0 }}>
                        {group.assignment.section_name}
                      </p>
                    </div>

                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th style={{ width: '20%' }}>Day</th>
                            <th style={{ width: '15%' }}>Start</th>
                            <th style={{ width: '15%' }}>End</th>
                            <th style={{ width: '30%' }}>Room</th>
                            <th style={{ width: '20%' }} className="text-right">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.schedules.map((schedule) => (
                            <tr key={schedule.id}>
                              <td data-label="Day">
                                <strong>{schedule.day_of_week_display}</strong>
                              </td>
                              <td data-label="Start">{normTime(schedule.start_time)}</td>
                              <td data-label="End">{normTime(schedule.end_time)}</td>
                              <td data-label="Room">
                                {schedule.room || <span className="subtle">—</span>}
                              </td>
                              <td data-label="Actions">
                                <div className="row-actions">
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-xs"
                                    onClick={() => handleEdit(schedule)}
                                    title="Edit schedule"
                                  >
                                    <Icon name="pencil" size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-xs"
                                    onClick={() => setDeletingSchedule(schedule)}
                                    title="Delete schedule"
                                    style={{ color: 'var(--red-700)' }}
                                  >
                                    <Icon name="trash" size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </section>
      </div>

      {(formOpen || editingSchedule) && (
        <ScheduleFormModal
          schedule={editingSchedule}
          existingSchedules={allSchedules}
          onClose={() => {
            setFormOpen(false)
            setEditingSchedule(null)
          }}
          onSaved={() => {
            setFormOpen(false)
            setEditingSchedule(null)
            refresh()
          }}
        />
      )}

      {selectedSchedule && (
        <ScheduleDetailPanel
          schedule={selectedSchedule}
          onClose={() => setSelectedSchedule(null)}
          onEdit={handleEdit}
          onDelete={(schedule) => {
            setSelectedSchedule(null)
            setDeletingSchedule(schedule)
          }}
        />
      )}

      {deletingSchedule && (
        <ConfirmDeleteModal
          schedule={deletingSchedule}
          onClose={() => {
            if (!deleting) {
              setDeletingSchedule(null)
              setDeleteError(null)
            }
          }}
          onDeleted={handleDelete}
          busy={deleting}
        />
      )}

      {deleteError && (
        <div
          className="alert alert-error"
          role="alert"
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            maxWidth: 400,
            zIndex: 1000,
          }}
        >
          <Icon name="info" size={15} />
          <span>{deleteError}</span>
        </div>
      )}

      {undoToast && (
        <UndoToast
          toast={undoToast}
          onUndo={handleUndo}
          onDismiss={dismissUndo}
        />
      )}
    </>
  )
}

export { schedulesOverlap, detectConflicts, groupConflicts, generatePeriodGrid, normTime, timeToMinutes }
