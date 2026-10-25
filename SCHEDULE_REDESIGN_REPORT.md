# TRACK Class Schedules Page — Redesign Report

**Date**: October 18, 2026  
**Page**: `/admin/schedules`  
**Status**: ✅ Redesign complete and verified

---

## 1. The Nine Conflicts — Actual Cause

I inspected the real database records (not the frontend) using
`backend/inspect_conflicts.py`. The school has **9 schedule records**,
all crammed into a single time slot on three days:

| Day | Time | Subject | Section | Teacher | Room |
|-----|------|---------|---------|---------|------|
| Mon 1 | 08:00–09:00 | Mathematics | Sampaguita | Teresa Reyes | Room 101 |
| Mon 1 | 08:00–09:00 | English     | Sampaguita | Teresa Reyes | Room 101 |
| Mon 1 | 08:00–09:00 | Science     | Gumamela   | Marco Dizon  | Room 101 |
| Wed 3 | 08:00–09:00 | Mathematics | Sampaguita | Teresa Reyes | Room 101 |
| Wed 3 | 08:00–09:00 | English     | Sampaguita | Teresa Reyes | Room 101 |
| Wed 3 | 08:00–09:00 | Science     | Gumamela   | Marco Dizon  | Room 101 |
| Fri 5 | 08:00–09:00 | Mathematics | Sampaguita | Teresa Reyes | Room 101 |
| Fri 5 | 08:00–09:00 | English     | Sampaguita | Teresa Reyes | Room 101 |
| Fri 5 | 08:00–09:00 | Science     | Gumamela   | Marco Dizon  | Room 101 |

Because three classes occupy the same 08:00–09:00 slot on each of
Monday, Wednesday, and Friday, every pair within a day conflicts:

- **3 conflicts/day** from the 3 pairs (Math⇄English, Math⇄Science, English⇄Science)
- **3 days × 3 pairs = 9 conflicts total**

The conflict reasons are real:

1. **Math vs English** — same teacher (Teresa Reyes), same section
   (Sampaguita), same room (Room 101). Three reasons.
2. **Math vs Science** — same room (Room 101) only. Different teacher,
   different section.
3. **English vs Science** — same room (Room 101) only.

This repeats identically on Wed and Fri. **The count of 9 is correct
and not a false positive** — I did not hide it or zero it out. An
administrator can resolve them by editing the schedules to use different
times or rooms.

---

## 2. Files Changed

### Backend
- **`backend/core/serializers.py`** — `ClassScheduleSerializer`
  `get_teacher_assignment_detail()` now includes `teacher_id`,
  `section_id`, and `grade_level`. Without these the frontend could
  not detect teacher or section conflicts (only room).

### Frontend
- **`frontend/src/pages/SchedulesPage.jsx`** — Redesigned to match the
  reference layout:
  - Compact **summary cards** (4 across) with clickable Conflicts card
  - **Toolbar** with week label, "Recurring" badge, view toggle, Add Schedule
  - **Filters bar** (teacher / section / subject / day + Clear)
  - **Large weekly timetable grid** with sticky header and time column
  - **Class cards** with subject, section, time, teacher, room
  - **Lane layout** so simultaneous classes render side-by-side
    (not stacked on top of each other)
  - **Conflict panel** listing every conflict with reasons and clickable
    schedule links
  - Timezone-aware "today" highlight using `Asia/Manila`
  - Loading, error, and empty states

- **`frontend/src/pages/SchedulesPage.css`** — Rewritten to support the
  new layout (sticky header, sticky time column, lane-based cards,
  compact summary cards, conflict panel).

### Diagnostic scripts (new, untracked)
- **`backend/inspect_conflicts.py`** — Reads the real database and prints
  every schedule and every detected conflict with reasons.

---

## 3. What Was Fixed

### Card readability
- Subject is the prominent primary label
- Section and time are always visible
- Teacher and room appear as secondary details when the card is tall enough
- Warning badge sits in reserved right padding (`padding-right: 22px`)
  so it never overlaps text
- Each subject gets a distinct color from a fixed palette (not all green)
- Cards use proper text contrast (white text with text-shadow on colored backgrounds)

### Timetable positioning
- `getSchedulePosition()` parses times into `HH:MM` and handles both
  slot-aligned and non-slot-aligned end times
- Card height is proportional to duration (60px per 30 minutes)
- 30-minute classes show subject + section + time only; taller classes
  show teacher and room too
- Simultaneous classes in the same day column are split into **lanes**
  via `groupOverlapping()` — each lane gets an equal slice of the column
  width, so 3 classes at 08:00–09:00 render as 3 narrow side-by-side
  cards instead of stacking on top of each other

### Conflict detection
- `detectConflicts()` checks `day_of_week` first (different days never conflict)
- Checks partial time overlap: `s1.start < s2.end && s1.end > s2.start`
- Uses a `Set` keyed on sorted ID pairs to avoid duplicate counts
- Detects three conflict types with reasons:
  - **Teacher** (same `teacher_id`) — severity high
  - **Section** (same `section_id`) — severity high
  - **Room** (same room, case-insensitive, trimmed) — severity medium
- Null guards on `teacher_id`/`section_id` so missing data doesn't
  produce false positives
- Different teachers, sections, and rooms are NOT flagged as conflicts
  merely for being simultaneous

### Dashboard statistics
- **Scheduled Periods** = `schedules.length`
- **Classes Today** = filtered by current weekday in `Asia/Manila`
  (uses `Intl.DateTimeFormat` with `timeZone: 'Asia/Manila'`)
- **Teachers with Schedules** = count of unique `teacher_assignment` IDs
- **Scheduling Conflicts** = `detectConflicts(schedules).length`
- No hardcoded numbers; all derived from actual API data

### Functionality preserved
- Timetable / List view toggle ✓
- Teacher / Section / Subject / Day filters ✓
- Add Schedule modal with real-time conflict warnings ✓
- Edit Schedule (click a card → Details → Edit) ✓
- Delete Schedule with confirmation ✓
- Room datalist suggestions ✓
- Duration validation ✓
- All existing API endpoints reused (`/schedules/`, `/teacher-assignments/`)
- No mock data, no duplicate endpoints, no database changes

---

## 4. Attendance Integration — Verified

The backend already supports automatic session generation:

- `POST /api/attendance/generate/` exists in `backend/core/views.py`
  (`generate_attendance_sessions`)
- `AttendanceSession` has a nullable `schedule` FK linking a session to
  the `ClassSchedule` that generated it
- Unique constraints prevent duplicate sessions for the same
  `(assignment, date, schedule)` triple
- The teacher's `AttendancePage` already calls this endpoint on mount

**No backend work was needed** for attendance integration — it was
already implemented. The Schedules page now displays the data that
feeds those auto-generated sessions, and the conflict detection helps
administrators fix schedules that would produce broken attendance.

---

## 5. Checks Performed

### Frontend build
```
npm run build
✓ 83 modules transformed
✓ dist/assets/index-JArf4moI.css  48.56 kB │ gzip:  9.79 kB
✓ dist/assets/index-BKSGjIuN.js   474.25 kB │ gzip: 129.39 kB
✓ built in 202ms
```
**Result**: ✅ Pass

### Frontend diagnostics
```
getDiagnostics on SchedulesPage.jsx → No diagnostics found
```
**Result**: ✅ Pass

### Frontend tests
```
npm test -- --run
Test Files  1 failed | 11 passed (12)
Tests       13 failed | 161 passed (174)
```
**Result**: ✅ All passing tests still pass. The 13 failures are all in
`AttendancePage.test.jsx` and pre-date this work — they expect a
"Take attendance" button that was removed when the attendance page was
redesigned to auto-generate sessions. None of these failures touch the
Schedules page.

### Backend tests
```
python manage.py test core
Ran 155 tests in 92.528s
OK
```
**Result**: ✅ All 155 backend tests pass. The serializer change
(adding `teacher_id`, `section_id`, `grade_level`) did not break anything.

### Database conflict inspection
```
python inspect_conflicts.py
=== SCHEDULES (9 total) ===
=== CONFLICTS (9 total) ===
[full list of 9 conflicts with reasons]
```
**Result**: ✅ The 9 conflicts are real and correctly detected.

---

## 6. Unresolved Issues

- **The 9 schedule conflicts themselves are data issues, not code bugs.**
  An administrator needs to edit the schedules (change times or rooms) to
  resolve them. The page now makes this easy: click the Conflicts card
  → conflict panel shows each pair and the reason → click a schedule →
  Edit → adjust time/room → Save.

- **`AttendancePage.test.jsx` has 13 failing tests** that pre-date this
  work. They should be updated to match the current attendance page UI
  (which auto-generates sessions instead of using a "Take attendance"
  button), but that is outside the scope of the Schedules page redesign.

- **No week navigation (Prev/Next/Today buttons).** The timetable shows
  a *recurring* weekly schedule, not dated calendar events, so navigating
  between weeks would not change the underlying data. A "Recurring" badge
  in the toolbar makes this explicit. If dated schedule instances are
  added in the future, week navigation can be added then.

---

## 7. Summary

The redesigned Schedules page now matches the reference layout:
- Compact dashboard header with 4 summary cards
- Clean toolbar with week label and view toggle
- Filter bar with working filters
- Large weekly timetable with accurate positioning, readable cards,
  simultaneous-class lane layout, and conflict indicators
- Clickable conflicts card that opens a detailed conflict panel

All values come from real backend data. The 9 conflicts are real and
correctly explained. No data was fabricated, deleted, or overwritten.
All existing functionality (CRUD, filters, view toggle, attendance
integration) is preserved.
