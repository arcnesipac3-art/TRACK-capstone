/**
 * Teacher attendance — sessions list + roster marking.
 *
 * Data sources (all existing backend behaviour):
 *  - GET /attendance/sessions/  → own sessions, each embedding its `records[]`
 *  - GET /teacher-assignments/  → maps assignment id → section id (the session
 *    payload only carries a section *label*, never the id)
 *  - GET /students/             → students in this teacher's sections
 *  - POST /attendance/generate/ → creates missing sessions from the class
 *    timetable (server skips duplicates; never fabricates sessions)
 *  - POST /attendance/records/  → mark a student who has no record yet
 *  - PATCH /attendance/records/<id>/ → change an existing mark
 *
 * Only the four statuses the model implements are offered: present, absent,
 * late, excused. The backend re-checks that the teacher owns the session and
 * that the student is enrolled in that class.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import ScreenList from '../../../components/ScreenList';

import { colors, spacing, radius, typography, type Tone } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import type {
  AttendanceRecord,
  AttendanceSession,
  AttendanceStatus,
  StudentProfile,
  TeacherAssignment,
} from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import AppHeader from '../../../components/ui/AppHeader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';

const STATUS_CHOICES: { value: AttendanceStatus; short: string; label: string }[] = [
  { value: 'present', short: 'P', label: 'Present' },
  { value: 'absent', short: 'A', label: 'Absent' },
  { value: 'late', short: 'L', label: 'Late' },
  { value: 'excused', short: 'E', label: 'Excused' },
];

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Session status → badge tone (mirrors the web sessions list). */
function sessionTone(status: AttendanceSession['status']): Tone {
  if (status === 'completed') return 'green';
  if (status === 'in_progress') return 'blue';
  return 'gray';
}

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function plusDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function TeacherAttendanceScreen() {
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<number | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [rowMessage, setRowMessage] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [sess, kids, assigns] = await Promise.all([
        api.list<AttendanceSession>('/attendance/sessions/'),
        api.list<StudentProfile>('/students/'),
        api.list<TeacherAssignment>('/teacher-assignments/'),
      ]);
      setSessions(sess);
      setStudents(kids);
      setAssignments(assigns);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load attendance sessions.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  /** assignment id → section id, for turning a session into a roster. */
  const sectionByAssignment = useMemo(() => {
    const map = new Map<number, number>();
    assignments.forEach((a) => map.set(a.id, a.section));
    return map;
  }, [assignments]);

  const rosterFor = useCallback(
    (session: AttendanceSession) => {
      const sectionId = sectionByAssignment.get(session.teacher_assignment);
      if (!sectionId) return [];
      return students.filter((s) => s.section === sectionId);
    },
    [sectionByAssignment, students]
  );

  const saveMark = async (session: AttendanceSession, studentId: number, status: AttendanceStatus) => {
    const key = `${session.id}:${studentId}`;
    if (savingKey) return;
    setSavingKey(key);
    setRowError(null);
    setRowMessage(null);
    try {
      const existing = session.records.find((r) => r.student === studentId);
      const saved: AttendanceRecord = existing
        ? await api.patch<AttendanceRecord>(`/attendance/records/${existing.id}/`, { status })
        : await api.post<AttendanceRecord>('/attendance/records/', {
            session: session.id,
            student: studentId,
            status,
          });

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== session.id) return s;
          const records = s.records.some((r) => r.id === saved.id)
            ? s.records.map((r) => (r.id === saved.id ? saved : r))
            : [...s.records, saved];
          return { ...s, records };
        })
      );
      setRowMessage(`Saved — ${saved.student_name}: ${status}.`);
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Could not save that mark.');
    } finally {
      setSavingKey(null);
    }
  };

  const generateNext7 = async () => {
    if (generating) return;
    setGenerating(true);
    setRowError(null);
    setFlash(null);
    try {
      const result = await api.post<{ generated: number; skipped: number }>(
        '/attendance/generate/',
        { start_date: todayIso(), end_date: plusDaysIso(7) }
      );
      setFlash(
        result.generated > 0
          ? `Generated ${result.generated} sessions (${result.skipped} already existed).`
          : `No new sessions to create — ${result.skipped} already exist.`
      );
      await load();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Could not generate sessions.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <LoadingState label="Loading attendance…" />;
  if (error && sessions.length === 0) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  return (
    <View style={styles.screen}>
      <AppHeader title="Attendance" subtitle="Tap a session to open its roster." />
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.navy700]} />}
        contentContainerStyle={styles.content}
      >
        <View style={styles.toolbar}>
          <Text style={styles.hint}>Newest first · tap a session to record marks</Text>
          <Button
            size="sm"
            variant="primary"
            block
            onPress={generateNext7}
            loading={generating}
            accessibilityLabel="Generate attendance sessions for the next 7 days"
          >
            Generate next 7 days
          </Button>
        </View>

        {flash && (
          <View style={styles.flash}>
            <Text style={styles.flashText}>{flash}</Text>
          </View>
        )}
        {rowError && <Text style={styles.errorText}>{rowError}</Text>}
        {rowMessage && <Text style={styles.okText}>{rowMessage}</Text>}

        {sessions.length === 0 ? (
          <EmptyState
            inline
            title="No attendance sessions"
            body="Generate sessions from your class timetable, or wait for the administrator to do so."
          />
        ) : (
          <ScreenList
            data={sessions}
            keyExtractor={(item) => String(item.id)}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={(item) => (
              <SessionCard
                session={item}
                roster={rosterFor(item)}
                expanded={expanded === item.id}
                onToggle={() => {
                  setExpanded(expanded === item.id ? null : item.id);
                  setRowError(null);
                  setRowMessage(null);
                }}
                savingKey={savingKey}
                onSave={(studentId, status) => saveMark(item, studentId, status)}
              />
            )}
          />
        )}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Session card + roster                                               */
/* ------------------------------------------------------------------ */

function SessionCard({
  session,
  roster,
  expanded,
  onToggle,
  savingKey,
  onSave,
}: {
  session: AttendanceSession;
  roster: StudentProfile[];
  expanded: boolean;
  onToggle: () => void;
  savingKey: string | null;
  onSave: (studentId: number, status: AttendanceStatus) => void;
}) {
  const marks = session.records.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const marked = session.records.length;

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={onToggle}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View style={styles.grow}>
          <Text style={styles.date}>{formatDate(session.date)}</Text>
          <Text style={styles.subject}>{session.subject_name}</Text>
          <Text style={styles.meta}>
            {session.section_name}
            {session.schedule_time
              ? ` · ${session.schedule_time.start_time}–${session.schedule_time.end_time}`
              : ''}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Badge label={session.status_display} tone={sessionTone(session.status)} />
          <Text style={styles.meta}>
            {marked > 0
              ? `${marks.present ?? 0} present · ${marks.absent ?? 0} absent · ${marks.late ?? 0} late · ${marks.excused ?? 0} excused`
              : 'No marks yet'}
          </Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.roster}>
          {roster.length === 0 ? (
            <Text style={styles.meta}>No students are enrolled in this class.</Text>
          ) : (
            roster.map((student) => {
              const record = session.records.find((r) => r.student === student.id);
              const busyKey = `${session.id}:${student.id}`;
              const busy = savingKey === busyKey;
              return (
                <View key={student.id} style={styles.rosterRow}>
                  <View style={styles.grow}>
                    <Text style={styles.studentName}>{student.user.full_name}</Text>
                    {record?.notes ? <Text style={styles.meta}>Note: {record.notes}</Text> : null}
                  </View>
                  <View style={styles.markGroup}>
                    {STATUS_CHOICES.map((choice) => {
                      const active = record?.status === choice.value;
                      return (
                        <TouchableOpacity
                          key={choice.value}
                          style={[styles.markButton, active && styles.markButtonActive]}
                          onPress={() => !busy && onSave(student.id, choice.value)}
                          disabled={busy || savingKey !== null}
                          activeOpacity={0.75}
                          accessibilityRole="button"
                          accessibilityLabel={`${choice.label} — ${student.user.full_name}`}
                          accessibilityState={{ selected: active, disabled: busy || savingKey !== null }}
                        >
                          <Text style={[styles.markLabel, active && styles.markLabelActive]}>
                            {choice.short}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  toolbar: { gap: spacing.sm, alignItems: 'stretch' },
  hint: { ...typography.muted },
  flash: { backgroundColor: colors.green100, borderRadius: radius.md, padding: spacing.md },
  flashText: { ...typography.body, color: colors.green700 },
  errorText: { ...typography.muted, color: colors.red700 },
  okText: { ...typography.muted, color: colors.green700 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md },
  grow: { flex: 1, minWidth: 0 },
  date: { ...typography.label, color: colors.navy700 },
  subject: { ...typography.heading, color: colors.text, marginTop: 2 },
  meta: { ...typography.muted, marginTop: 2 },
  headerRight: { alignItems: 'flex-end', gap: spacing.xs, maxWidth: '55%' },
  roster: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  studentName: { ...typography.body, fontWeight: '600', color: colors.text },
  markGroup: { flexDirection: 'row', gap: 4 },
  markButton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markButtonActive: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  markLabel: { ...typography.label, color: colors.textMuted, fontSize: 13 },
  markLabelActive: { color: colors.onNavy },
  separator: { height: 1 },
});
