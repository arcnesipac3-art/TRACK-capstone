# Schedule Page - Complete Improvement Plan

## 🎯 Overview

This document outlines all improvements needed to make the Schedules page production-ready for Kiwalan National High School, with emphasis on integrating automatic attendance session generation.

---

## Current State ✅

### What's Working:
- ✅ Weekly timetable grid view
- ✅ List view grouped by teacher assignment
- ✅ Teacher/section/subject/day filters
- ✅ Add Schedule button and form
- ✅ Edit/Delete functionality
- ✅ Basic conflict detection (room only)
- ✅ Summary cards with metrics
- ✅ Responsive design

### What Needs Improvement:

---

## 🔥 Priority 1: Fix Visual Clarity (CRITICAL)

### Problem:
- Schedule blocks look bland and empty
- Hard to distinguish between different subjects
- Not enough information visible at a glance
- Empty space not utilized effectively

### Solution:

#### A. Enhanced Schedule Block Display
```javascript
function ScheduleBlock({ schedule, onClick, style, hasConflict }) {
  const detail = schedule.teacher_assignment_detail
  const colors = getSubjectColor(detail?.subject_name || '')
  
  return (
    <button
      type="button"
      className={`timetable-block ${hasConflict ? 'has-conflict' : ''}`}
      onClick={() => onClick(schedule)}
      style={{
        ...style,
        background: `linear-gradient(135deg, ${colors.bg}, ${colors.border})`,
        borderColor: colors.border,
      }}
      title={`${detail?.subject_name} - ${detail?.section_name}`}
    >
      <div className="timetable-block-subject">{detail?.subject_name}</div>
      <div className="timetable-block-section">{detail?.section_name}</div>
      <div className="timetable-block-teacher">
        <Icon name="user" size={10} />
        {detail?.teacher_name}
      </div>
      <div className="timetable-block-time">
        <Icon name="clock" size={10} />
        {schedule.start_time?.slice(0, 5)} - {schedule.end_time?.slice(0, 5)}
      </div>
      {schedule.room && (
        <div className="timetable-block-room">
          <Icon name="mapPin" size={10} />
          {schedule.room}
        </div>
      )}
      {hasConflict && <span className="conflict-badge">⚠</span>}
    </button>
  )
}
```

#### B. Subject-Based Color System
```javascript
// Consistent colors for each subject
function getSubjectColor(subjectName) {
  const colorMap = {
    // STEM subjects
    'Mathematics': { bg: '#3b82f6', border: '#2563eb', text: 'white' },
    'Science': { bg: '#10b981', border: '#059669', text: 'white' },
    'Physics': { bg: '#8b5cf6', border: '#7c3aed', text: 'white' },
    'Chemistry': { bg: '#ec4899', border: '#db2777', text: 'white' },
    'Biology': { bg: '#14b8a6', border: '#0d9488', text: 'white' },
    
    // Language subjects
    'English': { bg: '#f59e0b', border: '#d97706', text: 'white' },
    'Filipino': { bg: '#ef4444', border: '#dc2626', text: 'white' },
    
    // Social Studies
    'History': { bg: '#a855f7', border: '#9333ea', text: 'white' },
    'Araling Panlipunan': { bg: '#06b6d4', border: '#0891b2', text: 'white' },
    
    // Arts & PE
    'Physical Education': { bg: '#84cc16', border: '#65a30d', text: 'white' },
    'Arts': { bg: '#f97316', border: '#ea580c', text: 'white' },
    'Music': { bg: '#ec4899', border: '#db2777', text: 'white' },
    
    // Technology
    'Computer': { bg: '#6366f1', border: '#4f46e5', text: 'white' },
    'TLE': { bg: '#14b8a6', border: '#0d9488', text: 'white' },
  }
  
  // Check for partial matches (e.g., "Mathematics 7" matches "Mathematics")
  for (const [key, value] of Object.entries(colorMap)) {
    if (subjectName?.toLowerCase().includes(key.toLowerCase())) {
      return value
    }
  }
  
  // Default color for unmatched subjects
  return { bg: '#64748b', border: '#475569', text: 'white' }
}
```

#### C. Updated CSS
```css
.timetable-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 8px;
  font-size: 0.8125rem;
  line-height: 1.3;
}

.timetable-block-subject {
  font-weight: 700;
  font-size: 0.875rem;
  margin-bottom: 2px;
}

.timetable-block-section {
  font-size: 0.75rem;
  opacity: 0.95;
}

.timetable-block-teacher,
.timetable-block-time,
.timetable-block-room {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.6875rem;
  opacity: 0.9;
}

.conflict-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 16px;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
}

.timetable-block.has-conflict {
  border: 2px solid #dc2626 !important;
  border-left: 4px solid #dc2626 !important;
  box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.1);
}
```

---

## 📅 Priority 2: Week Navigation & Today Button (CRITICAL)

### Problem:
- Shows only recurring weekly schedule
- No way to see which week/dates
- Can't navigate to past/future weeks
- Missing "Today" quick return

### Solution:

#### Implementation:
```javascript
export default function SchedulesPage() {
  // Week navigation state
  const [weekOffset, setWeekOffset] = useState(0) // 0 = current week
  
  // Calculate week date range
  const weekDates = useMemo(() => {
    const today = new Date()
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - today.getDay() + 1 + (weekOffset * 7))
    
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 4) // Friday
    
    return {
      start: startOfWeek,
      end: endOfWeek,
      label: `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      isCurrentWeek: weekOffset === 0
    }
  }, [weekOffset])
  
  // ... rest of component
  
  return (
    <>
      <PageHeader
        title="Class Schedules"
        subtitle="Manage weekly class schedules and prevent timetable conflicts"
      />
      
      {/* Week Navigation Bar */}
      <section className="week-nav-bar">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setWeekOffset(offset => offset - 1)}
        >
          <Icon name="chevronLeft" size={15} />
          Previous Week
        </button>
        
        <div className="week-display">
          <Icon name="calendar" size={16} />
          <strong>{weekDates.label}</strong>
          {weekDates.isCurrentWeek && (
            <span className="badge badge-primary">Current Week</span>
          )}
        </div>
        
        {!weekDates.isCurrentWeek && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setWeekOffset(0)}
          >
            <Icon name="target" size={15} />
            Today
          </button>
        )}
        
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setWeekOffset(offset => offset + 1)}
        >
          Next Week
          <Icon name="chevronRight" size={15} />
        </button>
      </section>
      
      {/* Rest of page ... */}
    </>
  )
}
```

#### CSS:
```css
.week-nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 24px;
  background: white;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: 16px;
}

.week-display {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1rem;
}

@media (max-width: 768px) {
  .week-nav-bar {
    flex-direction: column;
  }
  
  .week-nav-bar button span {
    display: none;
  }
}
```

---

## ⚠️ Priority 3: Accurate Conflict Detection (CRITICAL)

### Problem:
- Currently shows "9 scheduling conflicts" but only checks rooms
- Cannot detect teacher double-booking
- Cannot detect section overlaps
- `teacher_assignment_detail` lacks teacher_id and section_id

### Solution:

#### A. Enhanced Backend Serializer ⭐ REQUIRED FIRST
```python
# backend/core/serializers.py

def get_teacher_assignment_detail(self, obj):
    return {
        "id": obj.teacher_assignment.id,
        "teacher_id": obj.teacher_assignment.teacher_id,  # ← ADD THIS
        "teacher_name": obj.teacher_assignment.teacher.get_full_name(),
        "subject_name": obj.teacher_assignment.subject.name,
        "section_id": obj.teacher_assignment.section_id,  # ← ADD THIS
        "section_name": section_label(obj.teacher_assignment.section),
        "grade_level": obj.teacher_assignment.section.grade_level.name,  # ← ADD THIS
    }
```

#### B. Enhanced Frontend Detection
```javascript
// Detect all types of conflicts
function detectConflicts(schedules) {
  const conflicts = []
  const seen = new Set()
  
  for (let i = 0; i < schedules.length; i++) {
    for (let j = i + 1; j < schedules.length; j++) {
      const s1 = schedules[i]
      const s2 = schedules[j]
      
      // Only check if they overlap in time and day
      if (!schedulesOverlap(s1, s2)) continue
      
      const key = `${Math.min(s1.id, s2.id)}-${Math.max(s1.id, s2.id)}`
      if (seen.has(key)) continue
      
      const reasons = []
      const d1 = s1.teacher_assignment_detail
      const d2 = s2.teacher_assignment_detail
      
      // Check teacher conflict
      if (d1?.teacher_id === d2?.teacher_id) {
        reasons.push({
          type: 'teacher',
          message: `${d1.teacher_name} is scheduled for two classes at the same time`,
          severity: 'high'
        })
      }
      
      // Check section conflict
      if (d1?.section_id === d2?.section_id) {
        reasons.push({
          type: 'section',
          message: `${d1.section_name} has overlapping class times`,
          severity: 'high'
        })
      }
      
      // Check room conflict
      if (s1.room && s2.room && s1.room.toLowerCase() === s2.room.toLowerCase()) {
        reasons.push({
          type: 'room',
          message: `Room ${s1.room} is booked for multiple classes`,
          severity: 'medium'
        })
      }
      
      if (reasons.length > 0) {
        seen.add(key)
        conflicts.push({
          schedules: [s1, s2],
          reasons,
          day: s1.day_of_week,
          time: `${s1.start_time} - ${s1.end_time}`,
        })
      }
    }
  }
  
  return conflicts
}
```

#### C. Conflict Display Component
```javascript
function ConflictsList({ conflicts }) {
  if (conflicts.length === 0) return null
  
  return (
    <Modal
      open
      title={`${conflicts.length} Scheduling Conflict${conflicts.length === 1 ? '' : 's'}`}
      width={700}
    >
      <div className="stack stack-sm">
        {conflicts.map((conflict, idx) => (
          <div key={idx} className="conflict-card">
            <div className="conflict-header">
              <Icon name="alertTriangle" size={18} style={{ color: 'var(--red-700)' }} />
              <strong>
                {DAYS_OF_WEEK.find(d => d.value === conflict.day)?.label} {conflict.time}
              </strong>
            </div>
            
            <div className="conflict-schedules">
              {conflict.schedules.map(schedule => (
                <div key={schedule.id} className="conflict-schedule">
                  <div className="font-weight-bold">
                    {schedule.teacher_assignment_detail?.subject_name}
                  </div>
                  <div className="subtle">
                    {schedule.teacher_assignment_detail?.section_name}
                  </div>
                  <div className="subtle">
                    Teacher: {schedule.teacher_assignment_detail?.teacher_name}
                  </div>
                  {schedule.room && (
                    <div className="subtle">Room: {schedule.room}</div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="conflict-reasons">
              {conflict.reasons.map((reason, ridx) => (
                <div key={ridx} className={`conflict-reason conflict-${reason.severity}`}>
                  <Icon name="x" size={14} />
                  {reason.message}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
```

#### D. CSS
```css
.conflict-card {
  border: 1px solid var(--red-200);
  border-left: 4px solid var(--red-600);
  border-radius: var(--radius-md);
  padding: 16px;
  background: var(--red-50);
}

.conflict-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: var(--red-900);
}

.conflict-schedules {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.conflict-schedule {
  padding: 12px;
  background: white;
  border-radius: var(--radius-sm);
  border: 1px solid var(--red-200);
}

.conflict-reasons {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.conflict-reason {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  font-weight: 500;
}

.conflict-reason.conflict-high {
  background: var(--red-100);
  color: var(--red-900);
}

.conflict-reason.conflict-medium {
  background: var(--amber-100);
  color: var(--amber-900);
}
```

---

## 🎨 Priority 4: Improved Add/Edit Schedule Form

### Problem:
- Form is functional but could be better
- Conflict warnings shown but not explained
- No visual feedback for valid inputs
- Missing room suggestions

### Solution:

#### Enhanced Form:
```javascript
function ScheduleFormModal({ schedule, onClose, onSaved, existingSchedules = [] }) {
  const [assignment, setAssignment] = useState(schedule?.teacher_assignment || '')
  const [dayOfWeek, setDayOfWeek] = useState(schedule?.day_of_week || '')
  const [startTime, setStartTime] = useState(schedule?.start_time || '')
  const [endTime, setEndTime] = useState(schedule?.end_time || '')
  const [room, setRoom] = useState(schedule?.room || '')
  const [error, setError] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [busy, setBusy] = useState(false)

  const assignments = useFetch('/teacher-assignments/', { list: true })

  // Popular room suggestions
  const roomSuggestions = [
    'Room 101', 'Room 102', 'Room 103', 'Room 104', 'Room 105',
    'Science Lab', 'Computer Lab', 'Library', 'Gymnasium', 'Auditorium'
  ]

  const isEdit = Boolean(schedule)

  // Enhanced conflict checking
  function checkConflicts() {
    if (!assignment || !dayOfWeek || !startTime || !endTime) {
      setWarnings([])
      return
    }
    
    const tempSchedule = {
      id: schedule?.id || -1,
      teacher_assignment: Number(assignment),
      day_of_week: Number(dayOfWeek),
      start_time: startTime,
      end_time: endTime,
      room: room.trim(),
      teacher_assignment_detail: assignments.data?.find(a => a.id === Number(assignment))
    }
    
    const conflicts = []
    
    existingSchedules.forEach(existing => {
      if (existing.id === tempSchedule.id) return
      
      if (schedulesOverlap(tempSchedule, existing)) {
        const d1 = tempSchedule.teacher_assignment_detail
        const d2 = existing.teacher_assignment_detail
        
        // Teacher conflict
        if (d1?.teacher_id === d2?.teacher_id) {
          conflicts.push({
            type: 'error',
            message: `${d1.teacher_name} already has ${d2.subject_name} (${d2.section_name}) at this time`
          })
        }
        
        // Section conflict
        if (d1?.section_id === d2?.section_id) {
          conflicts.push({
            type: 'error',
            message: `${d1.section_name} already has ${d2.subject_name} scheduled at this time`
          })
        }
        
        // Room conflict
        if (existing.room && tempSchedule.room && 
            existing.room.toLowerCase() === tempSchedule.room.toLowerCase()) {
          conflicts.push({
            type: 'warning',
            message: `Room ${existing.room} is already booked for ${d2.subject_name} (${d2.section_name})`
          })
        }
      }
    })
    
    setWarnings(conflicts)
  }

  // Real-time validation
  useEffect(() => {
    if (assignment && dayOfWeek && startTime && endTime) {
      const timer = setTimeout(checkConflicts, 300)
      return () => clearTimeout(timer)
    }
  }, [assignment, dayOfWeek, startTime, endTime, room])

  // Validate time duration
  const duration = useMemo(() => {
    if (!startTime || !endTime) return null
    
    const start = new Date(`2000-01-01T${startTime}`)
    const end = new Date(`2000-01-01T${endTime}`)
    const diffMs = end - start
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins <= 0) return { valid: false, message: 'End time must be after start time' }
    if (diffMins < 30) return { valid: true, warning: 'Class is less than 30 minutes' }
    if (diffMins > 180) return { valid: true, warning: 'Class is more than 3 hours' }
    
    return { valid: true, duration: `${diffMins} minutes` }
  }, [startTime, endTime])

  const hasErrors = warnings.some(w => w.type === 'error') || (duration && !duration.valid)
  const hasWarnings = warnings.some(w => w.type === 'warning') || (duration && duration.warning)

  return (
    <Modal
      open
      title={isEdit ? 'Edit Class Schedule' : 'Add Schedule'}
      onClose={busy ? undefined : onClose}
      dismissible={!busy}
      width={600}
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={busy || hasErrors}
          >
            {busy && <span className="spinner spinner-sm" />}
            {busy ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Schedule'}
          </button>
        </>
      }
    >
      <form className="stack stack-sm" onSubmit={handleSubmit}>
        {/* Class and Subject */}
        <div className="field">
          <label htmlFor="schedule-assignment">
            Class and Subject <span className="required">*</span>
          </label>
          <select
            id="schedule-assignment"
            className="select"
            value={assignment}
            onChange={(e) => setAssignment(e.target.value)}
            disabled={busy || assignments.loading}
            required
          >
            <option value="">Select a class…</option>
            {(assignments.data || []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.subject_name} — {a.section_name} ({a.teacher_name})
              </option>
            ))}
          </select>
          {assignments.loading && (
            <p className="hint">Loading classes...</p>
          )}
        </div>

        {/* Day of Week */}
        <div className="field">
          <label htmlFor="schedule-day">
            Day of Week <span className="required">*</span>
          </label>
          <select
            id="schedule-day"
            className="select"
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(e.target.value)}
            disabled={busy}
            required
          >
            <option value="">Select a day…</option>
            {DAYS_OF_WEEK.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
        </div>

        {/* Time Range */}
        <div className="row row-wrap" style={{ gap: 12 }}>
          <div className="field" style={{ flex: 1, minWidth: '140px' }}>
            <label htmlFor="schedule-start">
              Start Time <span className="required">*</span>
            </label>
            <input
              id="schedule-start"
              className="input"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={busy}
              required
            />
          </div>

          <div className="field" style={{ flex: 1, minWidth: '140px' }}>
            <label htmlFor="schedule-end">
              End Time <span className="required">*</span>
            </label>
            <input
              id="schedule-end"
              className="input"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              disabled={busy}
              required
            />
          </div>
        </div>
        
        {/* Duration Feedback */}
        {duration && duration.valid && duration.duration && (
          <div className="alert alert-info">
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

        {/* Room */}
        <div className="field">
          <label htmlFor="schedule-room">Room</label>
          <input
            id="schedule-room"
            className="input"
            type="text"
            list="room-suggestions"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            disabled={busy}
            placeholder="e.g., Room 101, Science Lab"
            maxLength={50}
          />
          <datalist id="room-suggestions">
            {roomSuggestions.map(suggestion => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
          <p className="hint">Optional. Start typing to see suggestions.</p>
        </div>

        {/* Warnings and Errors */}
        {warnings.length > 0 && (
          <div className="stack stack-xs">
            {warnings.map((warning, idx) => (
              <div 
                key={idx}
                className={`alert alert-${warning.type === 'error' ? 'error' : 'warning'}`}
              >
                <Icon name={warning.type === 'error' ? 'x' : 'alertTriangle'} size={15} />
                <span>{warning.message}</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="alert alert-error">
            <Icon name="info" size={15} />
            <span>{error}</span>
          </div>
        )}
      </form>
    </Modal>
  )
}
```

---

## 🔗 Priority 5: Connect to Automatic Attendance (CRITICAL)

### Problem:
- Schedules exist but teacher still manually creates sessions
- No visual connection between schedules and attendance

### Solution Implemented:
✅ Backend already has:
- `POST /api/attendance/generate/` endpoint
- `AttendanceSession.schedule` foreign key
- Session auto-generation logic

✅ Frontend AttendancePage already:
- Auto-generates sessions on mount
- Shows schedule times
- Groups by Today/Upcoming/Past

### Additional Enhancement - Show Attendance Link:
```javascript
function ScheduleDetailPanel({ schedule, onClose, onEdit, onDelete }) {
  const [upcomingSessions, setUpcomingSessions] = useState([])
  
  useEffect(() => {
    // Fetch sessions generated from this schedule
    api.get(`/attendance/sessions/?schedule=${schedule.id}`)
      .then(data => setUpcomingSessions(data.results || []))
      .catch(err => console.error('Failed to load sessions:', err))
  }, [schedule.id])
  
  return (
    <Modal
      open
      title="Schedule Details"
      onClose={onClose}
      width={600}
      footer={/* ... */}
    >
      <div className="stack stack-sm">
        {/* Existing fields ... */}
        
        {/* NEW: Show linked attendance sessions */}
        <div className="schedule-attendance-link">
          <div className="label">Generated Attendance Sessions</div>
          {upcomingSessions.length === 0 ? (
            <p className="subtle">No sessions generated yet for this schedule.</p>
          ) : (
            <div className="stack stack-xs">
              {upcomingSessions.slice(0, 3).map(session => (
                <div key={session.id} className="session-preview">
                  <Icon name="calendar" size={14} />
                  <span>{formatDate(session.date)}</span>
                  <StatusBadge 
                    label={session.status_display}
                    tone={session.status === 'completed' ? 'success' : 'neutral'}
                  />
                </div>
              ))}
              {upcomingSessions.length > 3 && (
                <a href="/teacher/attendance" className="link">
                  View all {upcomingSessions.length} sessions →
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
```

---

## 📱 Priority 6: Mobile Improvements

### Solution:
```javascript
// Add mobile day selector
function MobileDayView({ schedules, currentDay, onDayChange, onScheduleClick }) {
  const daySchedules = schedules.filter(s => s.day_of_week === currentDay)
  
  return (
    <div className="mobile-schedule-view">
      {/* Day selector tabs */}
      <div className="mobile-day-tabs">
        {DAYS_OF_WEEK.map(day => (
          <button
            key={day.value}
            className={`mobile-day-tab ${currentDay === day.value ? 'active' : ''}`}
            onClick={() => onDayChange(day.value)}
          >
            {day.short}
          </button>
        ))}
      </div>
      
      {/* Schedule cards for selected day */}
      <div className="mobile-schedule-cards">
        {daySchedules.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No classes scheduled"
            message={`No classes on ${DAYS_OF_WEEK.find(d => d.value === currentDay)?.label}`}
          />
        ) : (
          daySchedules
            .sort((a, b) => a.start_time.localeCompare(b.start_time))
            .map(schedule => (
              <div
                key={schedule.id}
                className="mobile-schedule-card"
                onClick={() => onScheduleClick(schedule)}
              >
                <div className="mobile-schedule-time">
                  {schedule.start_time?.slice(0, 5)} - {schedule.end_time?.slice(0, 5)}
                </div>
                <div className="mobile-schedule-subject">
                  {schedule.teacher_assignment_detail?.subject_name}
                </div>
                <div className="mobile-schedule-section">
                  {schedule.teacher_assignment_detail?.section_name}
                </div>
                {schedule.room && (
                  <div className="mobile-schedule-room">
                    <Icon name="mapPin" size={12} />
                    {schedule.room}
                  </div>
                )}
              </div>
            ))
        )}
      </div>
    </div>
  )
}

// In main component
const [mobileDay, setMobileDay] = useState(new Date().getDay() || 1)
const isMobile = window.innerWidth < 768

return (
  <div>
    {/* Desktop: Full timetable grid */}
    {!isMobile && (
      <TimetableGrid schedules={filteredSchedules} onScheduleClick={handleScheduleClick} />
    )}
    
    {/* Mobile: Day-by-day cards */}
    {isMobile && (
      <MobileDayView
        schedules={filteredSchedules}
        currentDay={mobileDay}
        onDayChange={setMobileDay}
        onScheduleClick={handleScheduleClick}
      />
    )}
  </div>
)
```

---

## 📊 Summary of Changes Required

### Backend Changes (1 file):
1. ✅ **Enhance `ClassScheduleSerializer`** - Add `teacher_id`, `section_id`, `grade_level`

### Frontend Changes (1 file):
1. ✅ **SchedulesPage.jsx** - All improvements in one file:
   - Enhanced schedule block display
   - Subject-based colors
   - Week navigation
   - Improved conflict detection
   - Better form validation
   - Mobile day view
   - Attendance session links

### CSS Changes (1 file):
1. ✅ **SchedulesPage.css** - Add new styles

---

## 🎯 Implementation Priority

### Week 1 (Must Have):
1. ✅ Enhanced backend serializer (teacher_id, section_id)
2. ✅ Fixed conflict detection (teacher, section, room)
3. ✅ Subject-based color coding
4. ✅ Enhanced schedule block display

### Week 2 (Should Have):
5. ✅ Week navigation with date ranges
6. ✅ Today button
7. ✅ Improved form validation
8. ✅ Duration feedback

### Week 3 (Nice to Have):
9. ✅ Mobile day selector
10. ✅ Attendance session links
11. ✅ Conflict details modal

---

## ✅ Expected Results

After implementing all improvements:

1. **Visual Clarity** ✨
   - Each subject has distinct color
   - Schedule blocks show all key info
   - Conflicts clearly marked with ⚠️

2. **Conflict Detection** 🎯
   - Catches teacher double-booking
   - Catches section overlaps
   - Catches room conflicts
   - Shows detailed conflict reasons

3. **Navigation** 📅
   - Navigate between weeks
   - See actual calendar dates
   - Quick return to current week
   - Know which week you're viewing

4. **Better UX** 💡
   - Form validates in real-time
   - Shows duration and warnings
   - Room suggestions via datalist
   - Clear error messages

5. **Attendance Integration** 🔗
   - See which sessions were generated
   - Link directly to attendance page
   - Understand schedule → session flow

---

## 🧪 Testing Checklist

After implementation, verify:

- [ ] Subject colors are consistent and distinct
- [ ] Teacher conflicts are detected and displayed
- [ ] Section conflicts are detected and displayed
- [ ] Room conflicts are detected and displayed
- [ ] Week navigation shows correct dates
- [ ] Today button returns to current week
- [ ] Form prevents invalid time ranges
- [ ] Form shows real-time conflict warnings
- [ ] Mobile day selector works on phones
- [ ] Schedule detail shows linked sessions
- [ ] All filters still work correctly
- [ ] Summary cards update correctly
- [ ] No console errors

---

**Ready to implement!** Let me know which priority you'd like to start with, or I can implement all Priority 1 & 2 improvements in one go.
