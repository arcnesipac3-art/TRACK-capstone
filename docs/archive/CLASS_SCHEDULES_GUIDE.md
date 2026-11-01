# Class Schedules Guide

## 🎯 Overview

The Class Schedules feature enables automatic attendance session generation based on weekly class schedules. Administrators configure when classes meet, and the system automatically creates attendance sessions for teachers.

---

## 👥 Roles and Access

### Administrator
- **Creates** class schedules
- **Edits** existing schedules
- **Deletes** schedules
- **Views** all schedules across the school
- **Access**: Admin menu → Class Schedules

### Teacher
- **Views** their own schedules (read-only via API)
- **Cannot** create or modify schedules
- Sees auto-generated sessions based on their schedules

---

## 📋 How to Create Class Schedules

### Method 1: TRACK Admin UI (Recommended)

1. **Login as Administrator**
2. **Navigate**: Admin sidebar → **Class Schedules**
3. **Click**: "New Schedule" button
4. **Fill in the form**:
   - **Class and Subject**: Select teacher assignment (e.g., "Teresa Reyes — Mathematics — Grade 7 Sampaguita")
   - **Day of Week**: Monday through Sunday
   - **Start Time**: e.g., 08:00
   - **End Time**: e.g., 09:00
   - **Room**: Optional (e.g., "Room 101", "Science Lab")
5. **Save**: Click "Create Schedule"

### Method 2: Django Admin Panel

1. **Navigate**: http://127.0.0.1:8000/admin/
2. **Login** as admin
3. **Go to**: Core → Class schedules → Add class schedule
4. **Fill in** the fields and save

### Method 3: Python Script (Bulk Import)

Run the provided script to add sample schedules:
```bash
cd backend
python add_schedules.py
```

---

## 🔄 How Automatic Attendance Works

```
┌─────────────────────┐
│ Admin creates       │
│ class schedules     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ System generates    │
│ attendance sessions │
│ (today + 7 days)    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Teacher opens       │
│ attendance page     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Sessions displayed: │
│ - Today             │
│ - Upcoming          │
│ - Recent History    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Teacher marks       │
│ attendance          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Status auto-updates:│
│ Not Started →       │
│ In Progress →       │
│ Completed           │
└─────────────────────┘
```

---

## 📅 Schedule Management

### View All Schedules
- **Location**: Admin → Class Schedules
- **Grouped by**: Teacher assignment
- **Sorted by**: Day of week, then time

### Filter Schedules
- **By Teacher**: Select from dropdown
- **By Day**: Select day of week
- **Clear Filters**: Click "Clear" button

### Edit Schedule
1. Click **pencil icon** next to schedule
2. Modify fields
3. Click **Save Changes**

### Delete Schedule
1. Click **trash icon** next to schedule
2. Confirm deletion
3. **Note**: Past attendance sessions are preserved

---

## 🧪 Testing the System

### 1. Verify Schedules Exist
```bash
cd backend
python check_schedules.py
```

### 2. Test as Teacher
1. Login as teacher (e.g., Teresa Reyes)
2. Go to Attendance page
3. Should see: "✅ X class schedules configured"
4. Sessions auto-generate and display in groups

### 3. Test Session Generation
- Sessions generate automatically when:
  - Teacher opens attendance page
  - Schedules are loaded for first time
- Range: Today + next 7 days
- Duplicates: Automatically prevented

---

## 🎨 UI Features

### Schedule List View
- **Grouped cards** by teacher assignment
- **Table display** per assignment showing:
  - Day of week
  - Start time
  - End time
  - Room
  - Actions (edit/delete)

### Form Features
- **Validation**:
  - All required fields enforced
  - End time must be after start time
  - Duplicate prevention
- **Auto-save**: Immediate database update
- **Error handling**: Clear error messages

### Empty States
- No schedules: Prompts to create first schedule
- Filtered results empty: Suggests clearing filters

---

## 🔧 Technical Details

### Database Structure
**ClassSchedule Model**:
- `teacher_assignment`: FK to TeacherAssignment
- `day_of_week`: Integer (1=Monday, 7=Sunday)
- `start_time`: Time
- `end_time`: Time
- `room`: CharField (optional)

**Constraints**:
- Unique: (teacher_assignment, day_of_week, start_time)

### API Endpoints
- `GET /api/schedules/` - List schedules
- `POST /api/schedules/` - Create schedule (admin only)
- `PATCH /api/schedules/{id}/` - Update schedule (admin only)
- `DELETE /api/schedules/{id}/` - Delete schedule (admin only)
- `POST /api/attendance/generate/` - Generate sessions from schedules

### Permissions
- **List**: Teacher (own schedules), Admin (all schedules)
- **Create/Update/Delete**: Admin only

---

## 📱 User Experience

### For Administrators
1. One-time setup per school year/semester
2. Visual management interface
3. Bulk operations possible via script
4. Immediate effect on attendance generation

### For Teachers
1. No manual session creation needed
2. Sessions appear automatically
3. Clear organization (Today/Upcoming/Past)
4. Status tracking built-in
5. Focus on taking attendance, not scheduling

---

## 🚨 Troubleshooting

### "No class schedules configured" message
**Cause**: No schedules exist for the logged-in teacher
**Solution**: 
1. Login as admin
2. Go to Class Schedules
3. Create schedules for that teacher's assignments

### Schedules not appearing
**Check**:
1. Teacher has teacher assignments
2. Schedules exist for those assignments
3. Browser console for errors (F12)
4. Backend logs for API errors

### Sessions not auto-generating
**Check**:
1. Schedules loaded successfully (green banner)
2. Browser console for generation errors
3. Backend `/api/attendance/generate/` endpoint working
4. Teacher is logged in correctly

### Duplicate schedule error
**Cause**: Schedule already exists for that day/time/assignment
**Solution**: 
- Check existing schedules
- Edit existing schedule instead
- Or delete and recreate

---

## 📚 Sample Schedule Patterns

### Traditional Schedule (Mon/Wed/Fri)
```
Monday:    08:00 - 09:00
Wednesday: 08:00 - 09:00
Friday:    08:00 - 09:00
```

### Block Schedule (Tue/Thu)
```
Tuesday:  08:00 - 10:00
Thursday: 08:00 - 10:00
```

### Daily Schedule
```
Monday:    10:00 - 11:00
Tuesday:   10:00 - 11:00
Wednesday: 10:00 - 11:00
Thursday:  10:00 - 11:00
Friday:    10:00 - 11:00
```

---

## 🎓 Best Practices

1. **Set up schedules at the start of the school year**
2. **Use consistent room naming** (e.g., "Room 101" not "Rm. 101")
3. **Verify schedules** before going live
4. **Test with one teacher** before rolling out school-wide
5. **Keep schedules updated** when class times change
6. **Use descriptive room names** for clarity

---

## 🔗 Related Features

- **Teacher Assignments**: Must exist before creating schedules
- **Attendance Sessions**: Auto-generated from schedules
- **Attendance Records**: Teachers mark attendance in sessions
- **School Structure**: Sections and subjects linked to schedules

---

## 📞 Quick Reference

| Action | Location | Permission |
|--------|----------|------------|
| Create Schedule | Admin → Class Schedules | Admin only |
| Edit Schedule | Click pencil icon | Admin only |
| Delete Schedule | Click trash icon | Admin only |
| View Schedules | Admin → Class Schedules | Admin only |
| See Own Schedule | Auto in attendance | Teacher |
| Generate Sessions | Automatic on page load | System |

---

**Last Updated**: October 18, 2026
**TRACK Version**: 1.0
**Module**: Automatic Attendance
