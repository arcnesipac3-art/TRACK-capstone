/**
 * Admin "Classes" — school-wide timetable and attendance session monitoring.
 *
 * Both endpoints are read-only here: GET /schedules/ (all) and GET
 * /attendance/sessions/ (all), each session expandable to its recorded marks.
 * Session generation and schedule editing live in the web app.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView, TouchableOpacity } from 'react-native';
import ScreenList from '../../../components/ScreenList';

import { colors, spacing, radius, typography, type Tone } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import type { AttendanceSession, ClassSchedule } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import AppHeader from '../../../components/ui/AppHeader';
import Badge from '../../../components/ui/Badge';
import SegmentedControl from '../../../components/ui/SegmentedControl';

type Segment = 'timetable' | 'sessions';

const SEGMENT_OPTIONS: { label: string; value: Segment }[] = [
  { label: 'Timetable', value: 'timetable' },
  { label: 'Attendance sessions', value: 'sessions' },
];

const DAY_LABELS: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

/** Session status → badge tone. */
function sessionTone(status: AttendanceSession['status']): Tone {
  if (status === 'completed') return 'green';
  if (status === 'in_progress') return 'blue';
  return 'gray';
}

/** Record status → badge tone. */
function recordTone(status: string): Tone {
  switch (status) {
    case 'present': return 'green';
    case 'absent': return 'red';
    case 'late': return 'amber';
    case 'excused': return 'blue';
    default: return 'gray';
  }
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function AdminAttendanceScreen() {
  const [segment, setSegment] = useState<Segment>('timetable');
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [sched, sess] = await Promise.all([
        api.list<ClassSchedule>('/schedules/'),
        api.list<AttendanceSession>('/attendance/sessions/'),
      ]);
      setSchedules(sched);
      setSessions(sess);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load classes.');
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

  if (loading) return <LoadingState label="Loading classes…" />;
  if (error && schedules.length === 0 && sessions.length === 0) {
    return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;
  }

  const timetableByDay = Object.entries(DAY_LABELS)
    .map(([day, label]) => ({
      day: Number(day),
      label,
      slots: schedules
        .filter((s) => s.day_of_week === Number(day))
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    }))
    .filter((d) => d.slots.length > 0);

  return (
    <View style={styles.screen}>
      <AppHeader title="Classes" subtitle="Timetable and attendance sessions." />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.navy700]} />}
      >
        <SegmentedControl options={SEGMENT_OPTIONS} value={segment} onChange={setSegment} />

        {error && <Text style={styles.errorText}>{error}</Text>}

        {segment === 'timetable' ? (
          timetableByDay.length === 0 ? (
            <EmptyState inline title="No class schedules" body="Schedules are managed by the administrator on the web app." />
          ) : (
            timetableByDay.map((day) => (
              <View key={day.day} style={styles.daySection}>
                <Text style={styles.dayTitle}>{day.label}</Text>
                {day.slots.map((slot) => (
                  <View key={slot.id} style={styles.card}>
                    <Text style={styles.slotTime}>
                      {slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}
                      {slot.room ? ` · ${slot.room}` : ''}
                    </Text>
                    <Text style={styles.title}>{slot.teacher_assignment_detail.subject_name}</Text>
                    <Text style={styles.meta}>
                      {slot.teacher_assignment_detail.section_name} · {slot.teacher_assignment_detail.teacher_name}
                    </Text>
                  </View>
                ))}
              </View>
            ))
          )
        ) : sessions.length === 0 ? (
          <EmptyState inline title="No attendance sessions" body="Sessions appear once they are generated from the timetable." />
        ) : (
          <ScreenList
            data={sessions}
            keyExtractor={(item) => String(item.id)}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={(item) => {
              const isOpen = expanded === item.id;
              return (
                <View style={styles.card}>
                  <TouchableOpacity
                    style={styles.sessionHeader}
                    onPress={() => setExpanded(isOpen ? null : item.id)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                  >
                    <View style={styles.grow}>
                      <Text style={styles.title}>{item.subject_name}</Text>
                      <Text style={styles.meta}>
                        {formatDate(item.date)} · {item.section_name}
                        {item.schedule_time ? ` · ${item.schedule_time.start_time}` : ''}
                      </Text>
                    </View>
                    <Badge label={item.status_display} tone={sessionTone(item.status)} />
                  </TouchableOpacity>

                  {isOpen && (
                    <View style={styles.records}>
                      {item.records.length === 0 ? (
                        <Text style={styles.meta}>No marks recorded for this session.</Text>
                      ) : (
                        item.records.map((rec) => (
                          <View key={rec.id} style={styles.recordRow}>
                            <Text style={[styles.meta, styles.grow]} numberOfLines={1}>
                              {rec.student_name}
                            </Text>
                            <Badge label={rec.status} tone={recordTone(rec.status)} />
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  errorText: { ...typography.muted, color: colors.red700 },
  daySection: { gap: spacing.sm },
  dayTitle: { ...typography.heading, color: colors.navy900 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1, minWidth: 0 },
  slotTime: { ...typography.label, color: colors.navy700 },
  title: { ...typography.heading, color: colors.text },
  meta: { ...typography.muted },
  records: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  separator: { height: 1 },
});
