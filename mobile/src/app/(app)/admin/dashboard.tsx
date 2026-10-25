/**
 * Admin dashboard — GET /dashboard/ for role=admin.
 *
 * School-wide statistics, submission status counts, the attendance summary
 * and the latest audit-log activity — all read-only, straight from the
 * endpoint the web AdminDashboard uses.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';

import { colors, spacing, radius, typography } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import type { AdminDashboard } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import SignOutButton from '../../../components/SignOutButton';
import AppHeader from '../../../components/ui/AppHeader';
import StatTile from '../../../components/ui/StatTile';

type Tile = { label: string; value: number; tone: 'navy' | 'green' | 'amber' | 'red' };

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminDashboardScreen() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<AdminDashboard>('/dashboard/');
      setData(d);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the dashboard.');
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

  if (loading) return <LoadingState label="Loading dashboard…" />;
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

  const peopleTiles: Tile[] = data
    ? [
        { label: 'Students', value: data.total_students, tone: 'navy' },
        { label: 'Teachers', value: data.total_teachers, tone: 'navy' },
        { label: 'Parents', value: data.total_parents, tone: 'navy' },
        { label: 'Sections', value: data.total_sections, tone: 'navy' },
      ]
    : [];

  const requirementTiles: Tile[] = data
    ? [
        { label: 'Total', value: data.total_requirements, tone: 'navy' },
        { label: 'Active', value: data.active_requirements, tone: 'green' },
        { label: 'Submissions', value: data.total_submissions, tone: 'navy' },
        { label: 'Awaiting', value: data.submission_status.submitted, tone: 'amber' },
        { label: 'Verified', value: data.submission_status.verified, tone: 'green' },
        { label: 'Not submitted', value: data.submission_status.none, tone: 'navy' },
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
        title="Administration"
        subtitle={
          data
            ? `${data.total_users} user accounts${
                data.unread_notifications > 0
                  ? ` · ${data.unread_notifications} unread notifications`
                  : ''
              }`
            : undefined
        }
        right={<SignOutButton variant="onNavy" />}
      />
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.navy700]} />}
        contentContainerStyle={styles.content}
      >
        <View style={styles.section}>
          <TouchableOpacity
            onPress={() => router.push('/admin/directory')}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.sectionTitle}>People</Text>
          </TouchableOpacity>
          <View style={styles.grid}>
            {peopleTiles.map((item, i) => (
              <StatTile key={i} label={item.label} value={item.value} tone={item.tone} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            onPress={() => router.push('/admin/requirements')}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.sectionTitle}>Requirements &amp; submissions</Text>
          </TouchableOpacity>
          <View style={styles.grid}>
            {requirementTiles.map((item, i) => (
              <StatTile key={i} label={item.label} value={item.value} tone={item.tone} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            onPress={() => router.push('/admin/attendance')}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.sectionTitle}>Attendance</Text>
          </TouchableOpacity>
          <View style={styles.grid}>
            {attendanceTiles.map((item, i) => (
              <StatTile key={i} label={item.label} value={item.value} tone={item.tone} />
            ))}
          </View>
          <Text style={styles.rate}>
            {data && data.attendance.total_records > 0
              ? `Present rate: ${data.attendance.present_rate ?? 0}% across ${data.attendance.total_records} records`
              : 'No attendance recorded yet.'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          {data?.recent_activity.length ? (
            data.recent_activity.map((entry) => (
              <View key={entry.id} style={styles.listCard}>
                <Text style={styles.listTitle}>{entry.description}</Text>
                <Text style={styles.listMeta}>
                  {entry.action}
                  {entry.actor ? ` · ${entry.actor}` : ''} · {formatTimestamp(entry.timestamp)}
                </Text>
              </View>
            ))
          ) : (
            <EmptyState inline title="No recent activity" body="School activity will appear here." />
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
  rate: { ...typography.muted },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  listTitle: { ...typography.body, fontWeight: '600', color: colors.text },
  listMeta: { ...typography.subtle },
});
