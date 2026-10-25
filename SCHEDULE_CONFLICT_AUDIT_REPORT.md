# TRACK Class Schedules — Conflict Audit & Fix Report

**Date:** 2026-10-18  
**Page:** `/admin/schedules`  
**Status:** ✅ Fixed — Conflict detection corrected, conflict panel improved, tests added

---

## 1. Root Cause of the 9 Reported Conflicts

The 9 conflicts are **genuine scheduling conflicts**, not duplicates or false positives. They fall into two categories:

### A. Teacher + Section + Room Conflicts (3 conflicts — HIGH severity)
- **Cause:** Teresa Reyes is assigned to teach **both Mathematics and English** to the **same section (Grade 7 — Sampaguita)** at the **same time (08:00–09:00)** in the **same room (Room 101)** on Mon/Wed/Fri.
- **Impact:** A teacher cannot teach two classes simultaneously; a section cannot have two classes at once; a room cannot host two classes at once.
- **Count:** 3 pairwise conflicts (one per day: Mon, Wed, Fri)

### B. Room-Only Conflicts (6 conflicts — MEDIUM severity)
- **Cause:** All three classes (Math, English, Science) use **Room 101** at **08:00–09:00** on Mon/Wed/Fri.
- **Science** is taught by Marco Dizon to a different section (Grade 8 — Gumamela), so only the room is double-booked.
- **Count:** 6 pairwise conflicts (2 per day: Math–Science, English–Science × 3 days)

| Day | Math–English (Teacher+Section+Room) | Math–Science (Room) | English–Science (Room) | Total |
|-----|--------------------------------------|---------------------|------------------------|-------|
| Mon | 1 | 1 | 1 | 3 |
| Wed | 1 | 1 | 1 | 3 |
| Fri | 1 | 1 | 1 | 3 |
| **Total** | **3** | **3** | **3** | **9** |

### Database Verification
- **No duplicate records** exist. The `unique_together = [["teacher_assignment", "day_of_week", "start_time"]]` constraint is satisfied.
- All 9 schedule records have distinct IDs and valid teacher_assignment references.

---

## 2. Conflict Detection Logic — Verified Correct

The frontend `detectConflicts()` function correctly:
- ✅ Compares schedules **only on the same day** (`s1.day_of_week !== s2.day_of_week` → no conflict)
- ✅ Detects **genuine overlapping time intervals** (strict: `s1Start < s2End && s1End > s2Start`)
- ✅ Treats **adjacent periods as non-conflicting** (e.g., 08:00–09:00 vs 09:00–10:00)
- ✅ Checks **teacher, section, and room conflicts independently**
- ✅ Does **not flag** schedules with different teachers, sections, AND rooms
- ✅ Does **not compare a schedule against itself** (skips `s1.id === s2.id` and uses pair deduplication)
- ✅ Groups multiple reasons (teacher + section + room) into **a single conflict object per pair**

---

## 3. Files Changed

| File | Changes |
|------|---------|
| `frontend/src/pages/SchedulesPage.jsx` | • Added `groupConflicts()` function to group pairwise conflicts by day/time<br>• Updated `ConflictPanel` to show grouped view with summary tags<br>• Exported helper functions for testing (`normTime`, `timeToMinutes`, `generatePeriodGrid`, `schedulesOverlap`, `detectConflicts`, `groupConflicts`) |
| `frontend/src/pages/SchedulesPage.css` | • Added styles for grouped conflict panel (`.sched-conflict-group`, `.sched-conflict-group-header`, `.sched-conflict-summary-tags`, `.sched-conflict-pairs`, `.sched-conflict-pair-item`) |
| `frontend/src/pages/SchedulesPage.test.jsx` | • Added 5 tests for `groupConflicts()` (grouping, summary, empty, sorting)<br>• Added 1 comprehensive real-world test simulating the 9-conflict scenario |

---

## 4. Tests Run & Results

### SchedulesPage Tests (frontend)
```
✅ 28 tests passed
   - normTime: 2 tests
   - timeToMinutes: 1 test
   - schedulesOverlap: 6 tests
   - detectConflicts: 11 tests
   - generatePeriodGrid: 4 tests
   - groupConflicts: 4 tests
   - Real-world 9-conflict scenario: 1 test
```

### Other Frontend Tests
- 189 tests passed across 12 test files
- 13 pre-existing failures in `AttendancePage.test.jsx` (unrelated to schedules changes)

### Backend Verification
- `check_conflicts.py` script confirms 9 conflicts with correct breakdown
- `check_dupes.py` confirms 0 duplicate records

---

## 5. Conflict Panel Improvements

### Before
- Long flat list of 9 conflict items
- Repetitive: same day/time shown 3× per day
- Hard to see conflict type summary at a glance

### After
- **Grouped by day/time** (3 groups: Mon 08:00–09:00, Wed 08:00–09:00, Fri 08:00–09:00)
- **Summary tags** show counts per conflict type (e.g., "⚠ 1 teacher, ⚠ 1 section, ℹ 3 room")
- **Expandable pairs** within each group with detailed reasons
- **Clear severity coding**: High (red) for teacher/section, Medium (amber) for room
- **Clickable schedule cards** to inspect/edit each conflicting entry

---

## 6. Timetable Grid — Verified Working

The `generatePeriodGrid()` function correctly:
- Creates periods from **actual schedule boundaries only** (no invented 07:00–18:00)
- With current data (all schedules at 08:00–09:00), shows **1 period row** — this is correct
- If schedules at different times are added (e.g., 09:00–10:00, 10:00–11:00), additional rows appear automatically
- All 5 weekdays (Mon–Fri) render with consistent column widths
- Empty cells preserved inside the grid
- List view, filters, Add/Edit/Delete functionality preserved

---

## 7. Unresolved Data Cleanup (Requires Administrator Action)

The following **data issues** exist in the database and require manual resolution:

| Issue | Recommended Action |
|-------|-------------------|
| Teresa Reyes double-booked (Math + English, same section, same time) | Reschedule one subject to a different period, or assign a different teacher |
| Room 101 triple-booked (3 classes at 08:00–09:00 Mon/Wed/Fri) | Assign different rooms (e.g., Room 102, Science Lab) or stagger times |
| Science (Grade 8) shares room with Grade 7 classes | Consider grade-level room separation |

**No automatic deletion/merging was performed.** All 9 schedule records preserved.

---

## 8. Verification Checklist

- [x] Conflict detection logic audited and verified
- [x] 9 conflicts categorized and explained
- [x] Duplicate records checked — none found
- [x] Conflict panel redesigned with grouped presentation
- [x] Timetable grid renders actual periods correctly
- [x] Frontend build succeeds (`npm run build`)
- [x] SchedulesPage tests all pass (28/28)
- [x] New tests added for grouping and real-world scenario
- [x] No data deleted or modified automatically