# TRACK — Backup and Recovery

---

## 1. What must be backed up

| Asset | Location | Criticality |
|---|---|---|
| Database | PostgreSQL (Supabase) or SQLite (`backend/track_db.sqlite3`) | **Critical** — all student, attendance, submission, and account records |
| Uploaded files | `backend/media/submissions/` | High — student submission documents |
| Environment secrets | `SECRET_KEY`, `DATABASE_URL`, etc. | Critical — store in host secret manager, never in git |
| Application code | Git repository | Covered by version control |

---

## 2. Database backup

### PostgreSQL (production — Supabase)

#### Automated backups via Supabase
Supabase Pro and Team plans provide point-in-time recovery (PITR). The free tier provides daily backups retained for 7 days. Verify your actual plan's backup retention in the Supabase dashboard under Settings → Backups.

#### Manual pg_dump backup *(documented — requires PostgreSQL client tools)*
```bash
# Create a compressed backup
pg_dump -Fc \
  "postgres://user:pass@host:5432/dbname?sslmode=require" \
  -f /backups/track_$(date +%F).dump

# Verify the backup was created
ls -lh /backups/track_*.dump
```

Recommended schedule: nightly cron job. Store backups in a separate location from the server (S3, Google Drive, or Supabase Storage).

#### What to back up
```bash
# The safest nightly cron (POSIX):
pg_dump -Fc "$DATABASE_URL" -f "/backups/track_$(date +%F_%H%M).dump"

# Retain 14 days, then delete older files:
find /backups -name "track_*.dump" -mtime +14 -delete
```

#### Backup access control
- Backups must be readable only by the backup operator and the DBA.
- Never commit backups containing student records to Git.
- Encrypt backups stored in shared cloud storage.

---

### SQLite (development or single-server fallback)

#### Online backup (safe while the server is running) *(verified)*
```python
# Run from the project root with the virtual environment activated
python - <<'PY'
import sqlite3, datetime, pathlib
src = sqlite3.connect('backend/track_db.sqlite3')
dest_path = f'backups/track_{datetime.date.today()}.sqlite3'
pathlib.Path('backups').mkdir(exist_ok=True)
dst = sqlite3.connect(dest_path)
src.backup(dst)
dst.close(); src.close()
print(f'Backup written to {dest_path}')
PY
```

#### Cold backup (server stopped)
```bash
# Stop the Django server first, then:
copy backend\track_db.sqlite3 backups\track_YYYY-MM-DD.sqlite3
# Also copy .wal and .shm if they exist:
copy backend\track_db.sqlite3-wal backups\  (if present)
copy backend\track_db.sqlite3-shm backups\  (if present)
```

---

## 3. Uploaded file backup

Student submission files live in `backend/media/submissions/`. This directory is gitignored and must be backed up separately.

```bash
# Sync to a backup location (Linux)
rsync -av --progress backend/media/submissions/ /backups/media/

# Or archive:
tar -czf /backups/track_media_$(date +%F).tar.gz backend/media/
```

If the project migrates to Supabase Storage in a future phase, use the Supabase dashboard's export or the `supabase` CLI to download bucket contents.

---

## 4. Restore procedure

### Restore PostgreSQL from pg_dump *(documented)*
```bash
# 1. Point at a TEST database first — verify before touching production
# 2. Drop existing schema in the test DB if needed
# 3. Restore:
pg_restore --clean --if-exists \
  -d "postgres://user:pass@host:5432/test_dbname?sslmode=require" \
  /backups/track_YYYY-MM-DD.dump

# 4. Verify record counts (see §5 below)
# 5. Only after verification, repeat against the production DB
```

**Never run a restore against the only copy of the production database without a current backup of that database.**

### Restore SQLite
```bash
# 1. Stop the Django server
# 2. Replace the database file:
copy backups\track_YYYY-MM-DD.sqlite3 backend\track_db.sqlite3
# 3. Start the server
# 4. Verify counts (see §5 below)
```

---

## 5. Post-restore verification *(verified against dev DB)*

Run these checks immediately after every restore:

```bash
python backend/manage.py shell -c "
from django.contrib.auth import get_user_model
from core.models import StudentProfile, Submission, AttendanceRecord, AttendanceSession
User = get_user_model()
print('Users:', User.objects.count())
print('Students:', StudentProfile.objects.count())
print('Submissions:', Submission.objects.count())
print('Attendance sessions:', AttendanceSession.objects.count())
print('Attendance records:', AttendanceRecord.objects.count())
"
```

**Development database reference counts** (as of Phase 7 audit):
- Users: 9
- Students: 5
- Submissions: 9
- Attendance sessions: 20
- Attendance records: 38

Compare restored counts to the most recent pre-backup counts. Any significant discrepancy indicates a problem with the backup or restore.

Also verify authentication works:
```bash
# Quick API smoke test after restore
curl -X POST http://localhost:8000/api/auth/login/ \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"track2026"}'
# Expected: 200 with user object
```

---

## 6. SQLite to PostgreSQL data migration

Use this procedure when moving from the development SQLite database to a fresh PostgreSQL instance.

**Prerequisites:**
- A provisioned, empty PostgreSQL database
- `DATABASE_URL` for the target database
- The Django virtual environment activated

```bash
# 1. Create a dump of the source SQLite database
python backend/manage.py dumpdata \
  --exclude contenttypes \
  --exclude auth.permission \
  -o track_dump.json

# 2. Apply migrations to the empty PostgreSQL target
DATABASE_URL="postgres://user:pass@host:5432/dbname?sslmode=require" \
  python backend/manage.py migrate --noinput

# 3. Load the dump into PostgreSQL
DATABASE_URL="postgres://user:pass@host:5432/dbname?sslmode=require" \
  python backend/manage.py loaddata track_dump.json

# 4. Verify counts match the source
DATABASE_URL="postgres://user:pass@host:5432/dbname?sslmode=require" \
  python backend/manage.py shell -c "
from core.models import StudentProfile, Submission, AttendanceRecord
print('Students:', StudentProfile.objects.count())
print('Submissions:', Submission.objects.count())
print('Records:', AttendanceRecord.objects.count())
"
```

This procedure was verified end-to-end during the Phase 5 audit using a scratch database. The dump was 44,653 bytes, loaded 161 objects, and counts matched the source exactly.

**Do not run this against a populated production database without a backup.** This procedure targets an empty database and creates the schema fresh from migrations.

---

## 7. Recovery limitations

| Limitation | Notes |
|---|---|
| Supabase free tier | Daily backups, 7-day retention only. Upgrade for PITR. |
| No automated backup schedule | Backups must be triggered manually or by a cron job you configure. There is no built-in scheduler in TRACK. |
| Uploaded files not in PostgreSQL | `backend/media/` files are not backed up by database dumps. Back them up separately (§3). |
| No OTA mobile rollback | If a bad APK is distributed, users must install a new build. EAS Update is not configured. |
| No test restore in this audit | A restore against a separate test database was not performed in the Phase 7 audit because no PostgreSQL server was available in the audit environment. The dump/load procedure was verified against SQLite. |
| Render ephemeral disk | Render's free/starter tiers use ephemeral storage — `media/` files are lost on restart. Use a managed database and persistent object storage before collecting real submissions. |

---

## 8. Before using production with real student data

These steps must be completed before any real student or parent accounts are created:

1. Verify that automated daily backups are running and that at least one backup has been created and verified by restoring it to a test database.
2. Confirm that backup files are stored somewhere other than the production server.
3. Confirm that backup files are not publicly accessible.
4. Document who is responsible for monitoring backups and responding to failures.
5. Test the full restore-and-verify procedure at least once before real data is entered.
