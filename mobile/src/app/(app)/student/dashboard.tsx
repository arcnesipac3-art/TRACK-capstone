/**
 * Student dashboard — renders GET /dashboard/ for role=student.
 *
 * The payload shape is the backend's real one (`total_requirements`,
 * `not_submitted`, `attendance.by_status.*` — see api/types.ts), captured
 * live; an earlier version guessed field names that never existed and every
 * tile silently rendered `undefined`.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';

import { colors, spacing, typography } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import type { StudentDashboard } from '../../../api/types';
import { ErrorState, LoadingState } from '../../../components/StateViews';
import SignOutButton from '../../../components/SignOutButton';
import AppHeader from '../../../components/ui/AppHeader';
import StatTile from '../../../components/ui/StatTile';

type StatTone = 'navy' | 'green' | 'amber' | 'red';
type Tile = { label: string; value: number; tone: StatTone };

export default function StudentDashboardScreen() {
  const [data, setData] = useState<StudentDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<StudentDashboard>('/dashboard/');
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

  const requirementTiles: Tile[] = data
    ? [
        { label: 'Total', value: data.total_requirements, tone: 'navy' },
        { label: 'Not submitted', value: data.not_submitted, tone: 'navy' },
        { label: 'Awaiting check', value: data.awaiting_verification, tone: 'amber' },
        { label: 'Verified', value: data.verified, tone: 'green' },
        { label: 'Returned', value: data.returned, tone: 'amber' },
        { label: 'Overdue', value: data.overdue, tone: 'red' },
      ]
    : [];

  const attendanceTiles: Tile[] = data
    ? [
        { label: 'Present', value: data.attendance.by_status.present, tone: 'green' },
        { label: 'Absent', value: data.attendance.by_status.absent, tone: 'red' },
        { label: 'Late', value: data.attendance.by_status.late, tone: 'amber' },
        { label: 'Excused', value: data.attendance.by_status.excused, tone: 'navy' },
      ]
    : [];

  return (
    <View style={styles.screen}>
      <AppHeader
        hero
        title={data?.student_name ?? 'Student'}
        subtitle={data?.section ?? undefined}
        right={<SignOutButton variant="onNavy" />}
      />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.navy700]} />}
        contentContainerStyle={styles.content}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Requirements</Text>
          <View style={styles.grid}>
            {requirementTiles.map((item, i) => (
              <TouchableOpacity
                key={i}
                style={styles.tile}
                activeOpacity={0.8}
                onPress={() => router.push('/student/requirements')}
                accessibilityRole="button"
                accessibilityLabel={`View requirements — ${item.label}`}
              >
                <StatTile label={item.label} value={item.value} tone={item.tone} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Attendance</Text>
          <View style={styles.grid}>
            {attendanceTiles.map((item, i) => (
              <TouchableOpacity
                key={i}
                style={styles.tile}
                activeOpacity={0.8}
                onPress={() => router.push('/student/attendance')}
                accessibilityRole="button"
                accessibilityLabel={`View attendance — ${item.label}`}
              >
                <StatTile label={item.label} value={item.value} tone={item.tone} />
              </TouchableOpacity>
            ))}
          </View>
          {data && (
            <Text style={styles.rate}>
              {data.attendance.total_records > 0
                ? `Present rate: ${data.attendance.present_rate ?? 0}% across ${data.attendance.total_records} records`
                : 'No attendance recorded yet.'}
              {data.unread_notifications > 0 ? ` · ${data.unread_notifications} unread notifications` : ''}
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl },
  section: { gap: spacing.md },
  sectionTitle: { ...typography.label, color: colors.navy700 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { flexGrow: 1, flexBasis: '46%' },
  rate: { ...typography.muted },
});
