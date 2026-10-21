# TRACK — Administrator Handover Guide

This document is for the school administrator and IT staff responsible for maintaining TRACK after deployment. It covers day-to-day operations, user management, backups, monitoring, and incident response.

---

## 1. System overview

TRACK runs as three components:

| Component | Where it runs | What it does |
|---|---|---|
| Django backend | Render (or VPS) | REST API at `/api/*`, admin panel at `/admin/` |
| React web frontend | Vercel (or nginx) | Browser app for all roles |
| Expo mobile app | Android device | Native app for all roles |
| PostgreSQL database | Supabase | All school data |

The backend and database are the authoritative sources of truth. The frontend and mobile app only display and submit data — they have no local storage of student records.

---

## 2. Routine maintenance

### Daily
- Confirm the site is reachable: open the app and verify the login page loads.
- Check for failed background jobs: if deadline/overdue notifications are configured via cron, verify the cron log shows clean runs.

### Weekly
- Review the Django audit log: `GET /api/admin/ → AuditLog` (or directly in the admin panel at `/admin/core/auditlog/`). Look for unexpected password resets, user creations, or bulk deletions.
- Verify at least one recent database backup exists and is non-zero bytes.

### Monthly
- Run `pip install -r backend/requirements.txt` and `npm install` in each directory to check for outdated packages.
- Check Supabase dashboard for storage and database usage approaching plan limits.
- Review and archive any users who have graduated or left the school.

---

## 3. User and role management

### Creating accounts

Accounts are created by an administrator through the TRACK admin panel or the Users page in the web app. Each account requires:
- Username (unique), first name, last name, role
- Password (meets strength requirements: 8+ characters, not all numeric, not similar to username)

For **students**: LRN (Learner Reference Number, 12 digits) and section assignment are required.
For **parents**: link to one or more student profiles.

### Roles and what they can access

| Role | Can do |
|---|---|
| **admin** | Manage all users, school years, sections, subjects, assignments, schedules, requirements, attendance, announcements, and view all data |
| **teacher** | Manage requirements and attendance for their assigned classes; view students in their sections |
| **student** | View own requirements and submissions; view own attendance; submit work |
| **parent** | View linked child's requirements, submissions, and attendance |

### Resetting a password

Only an administrator can reset another user's password. Use the Users page in the web app, find the user, and use the "Reset Password" action. The new password is written to the server log and must be communicated to the user securely (in person or by phone). This action is recorded in the audit log.

There is no self-service password reset via email — no SMTP is configured.

### Deactivating accounts

Set `is_active = False` on a user account to prevent login without deleting the account or its data. Use this for graduated students, resigned teachers, or inactive parents. Deactivated accounts still appear in historical records.

### Parent-child relationships

A parent account must be linked to one or more student profiles. A parent can only see data for their linked children — this is enforced by the backend on every request. Create the student accounts first, then link them when creating the parent account.

---

## 4. School structure setup

The setup order matters because records depend on each other:

```
1. Create a School Year (e.g. "2026-2027", set is_active=True)
2. Create Grade Levels (e.g. "Grade 7" through "Grade 12")
3. Create Sections (e.g. "Sampaguita" under Grade 7, 2026-2027)
4. Create Subjects (e.g. "Mathematics" for Grade 7, 2026-2027)
5. Assign teacher accounts to subjects and sections (TeacherAssignment)
6. Create class schedules for each assignment
7. Add students to sections (via the student profile section field)
8. Add parent accounts and link them to students
```

**You cannot delete a school year that has sections.** Move or delete sections first. Deleting a school year would cascade and erase all student and attendance records.

---

## 5. Database backup responsibilities

The administrator is responsible for:
1. Verifying that automated backups are running daily.
2. Confirming at least one backup is stored outside the production server.
3. Testing the restore procedure at least once before real student data is entered.
4. Knowing the Supabase dashboard login to access managed backups.

See `docs/BACKUP_RECOVERY.md` for the full backup and restore procedure.

**Before anything else:** confirm Supabase's backup retention on your plan. Free tier provides 7-day retention. Upgrade the plan if longer retention is required by school policy.

---

## 6. Monitoring and troubleshooting

### Checking if the system is up
```bash
curl https://<backend-host>/api/health/
# Expected: {"status":"success","message":"TRACK backend is running."}
```

### Viewing backend logs
- **Render:** Dashboard → your web service → "Logs" tab. Filter by severity.
- **VPS:** `journalctl -u gunicorn --since "1 hour ago"` or your configured log location.

### Common issues

| Symptom | Check | Fix |
|---|---|---|
| Login page loads but login fails | Browser console for network errors; check if backend is running | Restart the backend service |
| "DisallowedHost" error | `DJANGO_ALLOWED_HOSTS` env var | Add the hostname |
| Admin panel CSS is broken | `collectstatic` not run | Redeploy (triggering collectstatic) |
| "CSRF verification failed" | Frontend URL not in `DJANGO_CSRF_ORIGINS` | Add the frontend origin |
| Mobile app: "Cannot reach server" | `EXPO_PUBLIC_API_URL` in the build | Rebuild with correct URL |
| User cannot log in | Password wrong or account inactive | Reset password or reactivate account |
| Missing attendance records | Teacher did not save/complete the session | Teacher should complete the session in the Attendance page |

---

## 7. Safe updates and migrations

### Backend code update
```bash
# 1. Pull latest code
git pull origin main

# 2. Install any new dependencies
pip install -r backend/requirements.txt

# 3. Apply new migrations (always safe — migrations are additive-only)
python backend/manage.py migrate --noinput

# 4. Collect static files
python backend/manage.py collectstatic --noinput

# 5. Restart the server
# Render: trigger a new deploy; VPS: sudo systemctl restart gunicorn
```

**Never delete migrations.** If a migration appears to conflict, investigate the cause. Running `python backend/manage.py showmigrations` shows which migrations have been applied.

### Frontend update
```bash
cd frontend
npm install
npm run build
# Deploy the contents of frontend/dist/ to Vercel or nginx
```

### Database schema changes
All migration files must be committed to git before deploying. A fresh deployment without the migration files will fail when `migrate --noinput` runs. Always check `git status` before deploying.

---

## 8. Student data privacy responsibilities

TRACK stores the following personal information:
- Full name, username, email
- Learner Reference Number (LRN)
- Date of birth, address, contact number (for students)
- Submission content (link URLs and uploaded documents)
- Attendance history
- Parent-child relationships

**Responsibilities:**
- Limit access to admin and teacher accounts to authorized staff only.
- Do not share database credentials with teachers or students.
- Do not export student records to unsecured spreadsheets or emails.
- Deactivate accounts of staff who leave the school immediately.
- Do not commit backups to public git repositories.
- Comply with the Philippine Data Privacy Act (RA 10173): maintain a privacy notice, provide a mechanism for data subjects to request correction or deletion, and report data breaches to the National Privacy Commission within 72 hours.

---

## 9. Incident response

### Data breach (unauthorized access to student records)
1. Immediately revoke affected credentials: reset passwords for compromised accounts.
2. If the server itself is compromised, take the service offline.
3. Restore from the most recent clean backup (see `docs/BACKUP_RECOVERY.md`).
4. Review the audit log (`/admin/core/auditlog/`) for affected records.
5. Report to the National Privacy Commission within 72 hours if personal data of students or parents was exposed.
6. Notify affected students and parents.

### Database corruption or accidental deletion
1. Do not make further writes to the database.
2. Restore from the most recent backup (see `docs/BACKUP_RECOVERY.md`).
3. Verify record counts after restore.
4. Identify what data was lost and whether it can be recovered from another source (e.g., teacher attendance records, paper receipts).

### Application is down
1. Check Render/VPS logs for the error.
2. Check Supabase dashboard for database connectivity.
3. Verify environment variables are still set (Render → your service → Environment).
4. If a recent deployment broke the app, roll back: Render dashboard → "Rollback to previous deploy".
5. If rollback is not available, deploy the last known-good commit.

---

## 10. Contact and escalation

Fill in these details before going live:

| Role | Name | Contact |
|---|---|---|
| School IT administrator | | |
| Database administrator | | |
| Application developer (capstone owner) | | |
| Supabase support | — | [supabase.com/support](https://supabase.com/support) |
| Render support | — | [render.com/docs](https://render.com/docs) |
