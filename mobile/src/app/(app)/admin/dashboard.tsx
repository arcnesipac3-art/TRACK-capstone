/**
 * Admin dashboard — GET /dashboard/ for role=admin.
 *
 * Composed the way Khan Academy composes a home screen: what needs attention
 * first, then one section per subject, each with a single blue action that opens
 * the full screen, and the numbers underneath. School-wide statistics,
 * submission status counts, the attendance summary and the latest audit-log
 * activity are all read-only, straight from the endpoint the web AdminDashboard
 * uses — nothing here is derived that the API did not send.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import { router } from 'expo-router';

import { colors, spacing, typography } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import { formatDateTime } from '../../../format';
import type { AdminDashboard } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import AppHeader from '../../../components/ui/AppHeader';
import Card from '../../../components/ui/Card';
import HeaderActions from '../../../components/ui/HeaderActions';
import ListRow from '../../../components/ui/ListRow';
import ProgressBar from '../../../components/ui/ProgressBar';
import SectionHeader from '../../../components/ui/SectionHeader';
import StatTile from '../../../components/ui/StatTile';
import type { Tone } from '../../../theme';

type Tile = { label: string; value: number; tone: 'navy' | 'green' | 'amber' | 'red' };

/** Screens the attention queue can open. */
type AdminQueueRoute = '/admin/requirements' | '/admin/notices' | '/admin/attendance';

type QueueRow = {
  key: string;
  icon: 'hourglass-outline' | 'notifications-outline' | 'alert-circle-outline';
  tone: Tone;
  title: string;
  subtitle: string;
  route: AdminQueueRoute;
};

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

  /**
   * The queue, in the order an administrator works it.
   *
   * Only the rows the server says are non-empty appear, so a clean school opens
   * on a quiet card instead of three zeros dressed up as tasks.
   */
  const queueRows: (QueueRow | null)[] = data
    ? [
        data.submission_status.submitted > 0
          ? {
              key: 'review',
              icon: 'hourglass-outline',
              tone: 'amber',
              title: `${data.submission_status.submitted} submission${
                data.submission_status.submitted === 1 ? '' : 's'
              } waiting to be verified`,
              subtitle: 'Requirements & submissions queue',
              route: '/admin/requirements',
            }
          : null,
        data.unread_notifications > 0
          ? {
              key: 'notices',
              icon: 'notifications-outline',
              tone: 'blue',
              title: `${data.unread_notifications} unread notification${
                data.unread_notifications === 1 ? '' : 's'
              }`,
              subtitle: 'Announcements sent to your account',
              route: '/admin/notices',
            }
          : null,
        data.attendance.by_status.absent > 0
          ? {
              key: 'absent',
              icon: 'alert-circle-outline',
              tone: 'red',
              title: `${data.attendance.by_status.absent} absent mark${
                data.attendance.by_status.absent === 1 ? '' : 's'
              } on record`,
              subtitle: 'Attendance register',
              route: '/admin/attendance',
            }
          : null,
      ]
    : [];

  const queue = queueRows.filter((row): row is QueueRow => row !== null);

  return (
    <View style={styles.screen}>
      <AppHeader
        hero
        title="Administration"
        subtitle={data ? `${data.total_users} user accounts on record` : undefined}
        right={<HeaderActions />}
      />
      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            colors={[colors.blue]}
          />
        }
        contentContainerStyle={styles.content}
      >
        {queue.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Needs attention" detail="Open the queue to work through it" />
            <Card padded={false} style={styles.stack}>
              {queue.map((row, index) => (
                <ListRow
                  key={row.key}
                  icon={row.icon}
                  tone={row.tone}
                  title={row.title}
                  subtitle={row.subtitle}
                  divider={index < queue.length - 1}
                  onPress={() => router.push(row.route)}
                />
              ))}
            </Card>
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionHeader
            title="People"
            actionLabel="Directory"
            onAction={() => router.push('/admin/directory')}
          />
          <View style={styles.grid}>
            {peopleTiles.map((item) => (
              <StatTile key={item.label} label={item.label} value={item.value} tone={item.tone} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="Requirements & submissions"
            actionLabel="Open"
            onAction={() => router.push('/admin/requirements')}
          />
          <View style={styles.grid}>
            {requirementTiles.map((item) => (
              <StatTile key={item.label} label={item.label} value={item.value} tone={item.tone} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="Attendance"
            actionLabel="Register"
            onAction={() => router.push('/admin/attendance')}
          />
          {data && data.attendance.total_records > 0 ? (
            <Card>
              <ProgressBar
                value={data.attendance.present_rate ?? 0}
                label="Present rate"
                detail={`${data.attendance.total_records} records`}
                tone="green"
              />
              <View style={styles.grid}>
                {attendanceTiles.map((item) => (
                  <StatTile key={item.label} label={item.label} value={item.value} tone={item.tone} />
                ))}
              </View>
            </Card>
          ) : (
            <Card>
              <Text style={styles.emptyLine}>No attendance recorded yet.</Text>
            </Card>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader title="Recent activity" detail="Last actions on record" />
          {data?.recent_activity.length ? (
            <Card padded={false} style={styles.stack}>
              {data.recent_activity.map((entry, index) => (
                <ListRow
                  key={entry.id}
                  icon="pulse-outline"
                  tone="gray"
                  title={entry.description}
                  subtitle={entry.actor ? `${entry.action} · ${entry.actor}` : entry.action}
                  meta={formatDateTime(entry.timestamp)}
                  divider={index < data.recent_activity.length - 1}
                  chevron={false}
                />
              ))}
            </Card>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  /** Rows inside a card carry their own separators so they read as one list. */
  stack: { gap: 0 },
  emptyLine: { ...typography.muted },
});
