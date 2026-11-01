# Schedule Page - Quick Reference Guide

## 🎨 Subject Color Chart

Use this chart to quickly identify subjects on the timetable:

| Subject | Color | Hex Code |
|---------|-------|----------|
| **STEM** |
| Mathematics | 🟦 Blue | #3b82f6 |
| Science | 🟩 Green | #10b981 |
| Physics | 🟪 Purple | #8b5cf6 |
| Chemistry | 🩷 Pink | #ec4899 |
| Biology | 🟦 Teal | #14b8a6 |
| **Language** |
| English | 🟧 Orange | #f59e0b |
| Filipino | 🟥 Red | #ef4444 |
| **Social** |
| History | 🟪 Purple | #a855f7 |
| Araling Panlipunan | 🟦 Cyan | #06b6d4 |
| **Arts & PE** |
| Physical Education | 🟩 Lime | #84cc16 |
| Arts | 🟧 Orange | #f97316 |
| Music | 🩷 Pink | #ec4899 |
| **Technology** |
| Computer | 🟦 Indigo | #6366f1 |
| TLE | 🟦 Teal | #14b8a6 |
| **Other** |
| Unknown/Other | ⬜ Gray | #64748b |

---

## ⚠️ Conflict Types

### High Priority (Prevents Saving)

**Teacher Double-Booking**
```
❌ Teresa Reyes already teaches Math (Grade 7-B) at this time
```
**Fix:** Change time or assign different teacher

**Section Overlap**
```
❌ Grade 7 - Sampaguita already has Science scheduled at this time
```
**Fix:** Change time for one of the classes

### Medium Priority (Warning Only)

**Room Conflict**
```
⚠ Room 101 is already booked for English (Grade 8-A)
```
**Note:** Can save if intentional (e.g., large room, team teaching)

---

## 📝 Adding a Schedule - Checklist

### Step 1: Open Form
- [ ] Click "Add Schedule" button
- [ ] Modal appears

### Step 2: Fill Required Fields
- [ ] Select **Class and Subject** (dropdown)
- [ ] Select **Day of Week** (Monday-Friday)
- [ ] Enter **Start Time** (e.g., 08:00)
- [ ] Enter **End Time** (e.g., 09:00)

### Step 3: Optional Info
- [ ] Enter **Room** (e.g., Room 101)
  - Type to see suggestions
  - Room 101-105, Science Lab, Computer Lab, etc.

### Step 4: Check Validation
- [ ] Duration shows (e.g., "60 minutes")
- [ ] No red error messages
- [ ] Green "Add Schedule" button enabled

### Step 5: Review Warnings
- [ ] Yellow warnings = can save (your choice)
- [ ] Red errors = must fix before saving

### Step 6: Save
- [ ] Click "Add Schedule"
- [ ] Wait for success
- [ ] Schedule appears on timetable

---

## 🔍 Finding Conflicts

### Visual Indicators:

1. **Conflict Alert Banner** (top of page)
   ```
   ⚠ 3 Scheduling Conflicts Detected
   ```

2. **Warning Badge on Block**
   - Pulsing ⚠ in top-right corner
   - Red border around block

3. **Conflict Count** (summary card)
   - Red icon if conflicts > 0
   - Green checkmark if 0 conflicts

### To Fix Conflicts:

1. Click the schedule block with ⚠
2. Click "Edit"
3. Change time OR room OR teacher assignment
4. Watch conflict warning disappear
5. Save changes

---

## 🕐 Time Validation Rules

| Duration | Status | Message |
|----------|--------|---------|
| End before start | ❌ Error | "End time must be after start time" |
| Less than 30 min | ⚠ Warning | "Class is less than 30 minutes" |
| 30 min - 3 hours | ✅ Valid | "Class duration: X minutes" |
| More than 3 hours | ⚠ Warning | "Class is more than 3 hours" |

---

## 📱 Interface Guide

### Summary Cards (Top)
```
┌─────────────────────────────────────────────┐
│ 📅 42 Scheduled Periods                     │
│ 🕐 8 Classes Today                          │
│ 👥 5 Teachers with Schedules                │
│ ⚠ 0 Scheduling Conflicts                   │
└─────────────────────────────────────────────┘
```

### Filters Bar
```
[All teachers ▼] [All sections ▼] [All subjects ▼] [All days ▼] [× Clear]
```

### View Toggle
```
[📊 Timetable] [📋 List]
```

### Action Button
```
[+ Add Schedule]
```

---

## 🎯 Common Tasks

### Task: Add Monday 8AM Math class
1. Click "Add Schedule"
2. Select "Teresa Reyes — Mathematics — Grade 7 Sampaguita"
3. Select "Monday"
4. Enter start: 08:00
5. Enter end: 09:00
6. Enter room: Room 101
7. Click "Add Schedule"

### Task: Fix teacher double-booking
1. Find block with ⚠ badge
2. Click block → Details appear
3. Note the time conflict
4. Click "Edit"
5. Change start/end time
6. Save (⚠ should disappear)

### Task: View all Math classes
1. Click "All subjects ▼" filter
2. Select "Mathematics"
3. Timetable shows only Math (all blue)
4. Click "× Clear" to reset

### Task: Check Friday's schedule
1. Click "All days ▼" filter
2. Select "Friday"
3. Timetable shows only Friday column
4. Click "× Clear" to reset

---

## 💡 Pro Tips

### Color Patterns
- **Blue family** = Math, Science, Computer
- **Warm colors** = Languages, Arts
- **Green** = Science, PE
- If colors repeat, they're related subjects

### Conflict Prevention
- Schedule same teacher at different times
- Avoid back-to-back classes (leave 5-10 min buffer)
- Popular rooms fill fast - check conflicts early

### Form Shortcuts
- Room suggestions auto-complete (start typing)
- Tab through fields quickly
- Warnings update as you type (300ms delay)

### Filtering
- Combine filters: Teacher + Day = "Teresa's Monday schedule"
- Use "Clear" to reset all at once
- Filters don't affect the data, only the view

---

## ⚡ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Tab | Move between form fields |
| Enter | Submit form (if valid) |
| Esc | Close modal |
| ↑↓ | Navigate dropdown options |

---

## 🔧 Troubleshooting

### "Cannot save - there are conflicts"
**Cause:** Teacher or section double-booked  
**Fix:** Change time by 30+ minutes OR use different day

### Room suggestion not appearing
**Cause:** Room not in predefined list  
**Fix:** Type full room name manually (still works)

### Duration shows as "0 minutes"
**Cause:** Start and end time are the same  
**Fix:** Set end time at least 30 minutes after start

### Schedule block looks cut off
**Cause:** Block too small for all text  
**Fix:** Hover to see full details, or make class longer

### Can't find a schedule
**Cause:** Filters are active  
**Fix:** Click "× Clear" to reset all filters

---

## 📊 Statistics

### Summary Card Meanings:

**Scheduled Periods**
- Total number of schedule entries
- Each day/time = 1 period

**Classes Today**
- How many classes happen today
- Based on current day of week

**Teachers with Schedules**
- Number of unique teachers assigned
- Doesn't count same teacher twice

**Scheduling Conflicts**
- Number of overlapping schedules
- 0 = no problems
- >0 = review needed

---

## 🎓 Best Practices

### DO:
✅ Add all schedules for a teacher at once  
✅ Use consistent room names (e.g., "Room 101" not "Rm 101")  
✅ Check for conflicts before finalizing  
✅ Leave buffer time between classes  
✅ Review timetable after bulk additions  

### DON'T:
❌ Schedule back-to-back classes (no break)  
❌ Use different names for same room  
❌ Ignore conflict warnings  
❌ Add schedules for inactive teachers  
❌ Duplicate schedules manually  

---

## 🚨 Red Flags

Watch for these warning signs:

- ⚠ **Many conflicts**: Review all schedules systematically
- **Same teacher, many sections**: May need assistant
- **Room always booked**: Consider adding more rooms
- **Classes > 2 hours**: Students may need break
- **Classes < 45 min**: May be too short

---

## 📞 Getting Help

**Technical Issues:**
- Check console (F12) for errors
- Refresh page
- Clear browser cache
- Contact IT support

**Scheduling Questions:**
- Refer to CLASS_SCHEDULES_GUIDE.md
- Ask experienced administrator
- Review SCHEDULE_IMPROVEMENTS_IMPLEMENTED.md

---

**Last Updated**: October 18, 2026  
**Version**: 1.0  
**For**: Kiwalan National High School
