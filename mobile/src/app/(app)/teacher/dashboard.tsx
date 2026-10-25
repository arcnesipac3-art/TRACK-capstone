/**
 * Teacher dashboard — GET /dashboard/ for role=teacher.
 *
 * Real payload fields only: assigned classes, pending verifications,
 * submission status counts, upcoming deadlines, recent submissions and the
 * attendance summary (see api/types.ts TeacherDashboard).
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';

import { colors, spacing, radius, typography, tones } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import type { TeacherDashboard } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import SignOutButton from '../../../components/SignOutButton';
import AppHeader from '../../../components/ui/AppHeader';
import StatTile from '../../../components/ui/StatTile';

type Tile = { label: string; value: number | string; tone: 'navy' | 'amber'; pressable?: boolean };

function formatDeadline(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function TeacherDashboardScreen() {
  const [data, setData] = useState<TeacherDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<TeacherDashboard>('/dashboard/');
      setData(d);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your dashboard.');
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

  if (loading) return <LoadingState label="Loading your dashboard…" />;
  if (error && !data) {
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setLoading(true);
          load();
        }}
      />
    );
  }

  const stats: Tile[] = data
    ? [
        { label: 'Classes', value: data.assigned_classes, tone: 'navy' },
        { label: 'Requirements', value: data.total_requirements, tone: 'navy' },
        { label: 'Pending check', value: data.pending_verification, tone: 'amber', pressable: true },
        { label: 'Verified', value: data.submission_status.verified, tone: 'navy' },
        { label: 'Returned', value: data.submission_status.returned, tone: 'navy' },
        { label: 'Not submitted', value: data.submission_status.none, tone: 'navy' },
      ]
    : [];

  return (
    <View style={styles.screen}>
      <AppHeader
        hero
        title={data?.teacher_name ?? 'Teacher'}
        subtitle="Your classes at a glance."
        right={<SignOutButton variant="onNavy" />}
      />
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.navy700]} />}
        contentContainerStyle={styles.content}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>At a glance</Text>
          <View style={styles.grid}>
            {stats.map((item, i) =>
              item.pressable ? (
                <TouchableOpacity
                  key={i}
                  style={styles.statPress}
                  onPress={() => router.push('/teacher/review')}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                >
                  <StatTile label={item.label} value={item.value} tone={item.tone} style={styles.statFill} />
                </TouchableOpacity>
              ) : (
                <StatTile key={i} label={item.label} value={item.value} tone={item.tone} />
              )
            )}
          </View>
          <Text style={styles.rate}>
            {data && data.attendance.total_records > 0
              ? `Attendance: ${data.attendance.present_rate ?? 0}% present across ${data.attendance.total_records} records`
              : 'No attendance recorded yet.'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My classes</Text>
          {data?.classes.length ? (
            data.classes.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.listCard}
                onPress={() => router.push('/teacher/timetable')}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={styles.listTitle}>{c.subject}</Text>
                <Text style={styles.listMeta}>{c.section}</Text>
              </TouchableOpacity>
            ))
          ) : (
            <EmptyState inline title="No classes yet" body="Assigned classes will appear here." />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming deadlines</Text>
          {data?.upcoming_deadlines.length ? (
            data.upcoming_deadlines.map((d) => (
              <View key={d.id} style={styles.listCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.listTitle}>{d.title}</Text>
                  <Text style={[styles.listMeta, d.is_overdue && { color: colors.red700 }]}>
                    {formatDeadline(d.deadline)}
                  </Text>
                </View>
                <Text style={styles.listMeta}>
                  {d.subject} · {d.section}
                  {d.is_overdue ? ' · Overdue' : ''}
                </Text>
              </View>
            ))
          ) : (
            <EmptyState inline title="No upcoming deadlines" body="Nothing due soon." />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent submissions</Text>
          {data?.recent_activity.length ? (
            data.recent_activity.map((a) => (
              <View key={a.id} style={styles.listCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.listTitle}>{a.requirement_title}</Text>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor:
                          a.status === 'verified'
                            ? tones.green.background
                            : a.status === 'returned'
                              ? tones.amber.background
                              : tones.blue.background,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '600',
                        textTransform: 'uppercase',
                        color:
                          a.status === 'verified'
                            ? tones.green.text
                            : a.status === 'returned'
                              ? tones.amber.text
                              : tones.blue.text,
                      }}
                    >
                      {a.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.listMeta}>{a.student_name}</Text>
              </View>
            ))
          ) : (
            <EmptyState inline title="No recent submissions" body="Student submissions will appear here." />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl },
  section: { gap: spacing.md },
  sectionTitle: { ...typography.heading, color: colors.navy900 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statPress: { flexGrow: 1, flexBasis: '46%' },
  statFill: { flexGrow: 0, flexBasis: 'auto' },
  rate: { ...typography.muted },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  listTitle: { ...typography.heading, color: colors.text, flexShrink: 1 },
  listMeta: { ...typography.muted },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
});
