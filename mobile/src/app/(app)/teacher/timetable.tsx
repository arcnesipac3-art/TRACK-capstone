/**
 * Teacher timetable — weekly view of GET /schedules/ (teacher sees only
 * their own assignments; server-enforced).
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView } from 'react-native';

import { colors, spacing, radius, typography } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import type { ClassSchedule } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import AppHeader from '../../../components/ui/AppHeader';

/** 1 = Monday … 7 = Sunday (Django isoweekday). */
const DAY_ORDER = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
];

export default function TeacherTimetableScreen() {
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.list<ClassSchedule>('/schedules/');
      setSchedules(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your timetable.');
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

  if (loading) return <LoadingState label="Loading timetable…" />;
  if (error && schedules.length === 0) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  const byDay = DAY_ORDER.map((day) => ({
    ...day,
    slots: schedules
      .filter((s) => s.day_of_week === day.value)
      .sort((a, b) => a.start_time.localeCompare(b.start_time)),
  })).filter((day) => day.slots.length > 0);

  return (
    <View style={styles.screen}>
      <AppHeader title="Timetable" subtitle="Your teaching schedule." />
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.navy700]} />}
        contentContainerStyle={styles.content}
      >
        {error && <Text style={styles.errorText}>{error}</Text>}
        {byDay.length === 0 ? (
          <EmptyState
            inline
            title="No class schedule"
            body="Your weekly timetable will appear here once your class schedules are set up."
          />
        ) : (
          byDay.map((day) => (
            <View key={day.value} style={styles.daySection}>
              <Text style={styles.dayTitle}>{day.label}</Text>
              {day.slots.map((slot) => (
                <View key={slot.id} style={styles.slotCard}>
                  <View style={styles.slotTop}>
                    <Text style={styles.slotTime}>
                      {slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}
                    </Text>
                    {slot.room ? <Text style={styles.slotRoom}>{slot.room}</Text> : null}
                  </View>
                  <Text style={styles.slotSubject}>{slot.teacher_assignment_detail.subject_name}</Text>
                  <Text style={styles.slotMeta}>{slot.teacher_assignment_detail.section_name}</Text>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxl },
  errorText: { ...typography.muted, color: colors.red700 },
  daySection: { gap: spacing.sm },
  dayTitle: { ...typography.heading, color: colors.navy900 },
  slotCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  slotTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  slotTime: { ...typography.label, color: colors.navy700 },
  slotRoom: { ...typography.subtle },
  slotSubject: { ...typography.heading, color: colors.text, marginTop: 2 },
  slotMeta: { ...typography.muted },
});
