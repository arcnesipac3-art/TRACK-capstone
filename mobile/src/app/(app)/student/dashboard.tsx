/**
 * Student dashboard — renders GET /dashboard/ for role=student.
 *
 * Composed the way Khan Academy composes a home screen: the queue of things the
 * student still has to act on is first, then one read-only section per subject
 * with a single blue action that opens the full screen. Tiles are numbers, not
 * buttons — before this, ten counters were each tappable and ten taps went to
 * two places, so nothing on the screen said what to do first.
 *
 * The payload shape is the backend's real one (`total_requirements`,
 * `not_submitted`, `attendance.by_status.*` — see api/types.ts), captured live;
 * an earlier version guessed field names that never existed and every tile
 * silently rendered `undefined`.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import { router } from 'expo-router';

import { colors, spacing, typography } from '../../../theme';
import type { Tone } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import type { StudentDashboard } from '../../../api/types';
import { ErrorState, LoadingState } from '../../../components/StateViews';
import HeaderActions from '../../../components/ui/HeaderActions';
import AppHeader from '../../../components/ui/AppHeader';
import Card from '../../../components/ui/Card';
import ListRow from '../../../components/ui/ListRow';
import ProgressBar from '../../../components/ui/ProgressBar';
import SectionHeader from '../../../components/ui/SectionHeader';
import StatTile from '../../../components/ui/StatTile';

type StatTone = 'navy' | 'green' | 'amber' | 'red';
type Tile = { label: string; value: number; tone: StatTone };

/** Screens the attention queue can open. */
type StudentQueueRoute = '/student/requirements' | '/student/attendance' | '/student/notifications';

type QueueRow = {
  key: string;
  icon: 'alert-circle-outline' | 'document-text-outline' | 'refresh-outline' | 'hourglass-outline' | 'megaphone-outline';
  tone: Tone;
  title: string;
  subtitle: string;
  route: StudentQueueRoute;
};

const plural = (n: number) => (n === 1 ? '' : 's');

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

  /**
   * The queue, in the order a student works it.
   *
   * Only the rows the server says are non-empty appear, so a student who is
   * up to date opens on a quiet card instead of four zeros dressed up as tasks.
   */
  const queueRows: (QueueRow | null)[] = data
    ? [
        data.overdue > 0
          ? {
              key: 'overdue',
              icon: 'alert-circle-outline',
              tone: 'red',
              title: `${data.overdue} requirement${plural(data.overdue)} past due`,
              subtitle: 'Deadline has passed — submit as soon as you can',
              route: '/student/requirements',
            }
          : null,
        data.not_submitted > 0
          ? {
              key: 'todo',
              icon: 'document-text-outline',
              tone: 'amber',
              title: `${data.not_submitted} not submitted yet`,
              subtitle: 'Open requirements to turn them in',
              route: '/student/requirements',
            }
          : null,
        data.returned > 0
          ? {
              key: 'returned',
              icon: 'refresh-outline',
              tone: 'amber',
              title: `${data.returned} returned for corrections`,
              subtitle: 'A teacher sent your work back',
              route: '/student/requirements',
            }
          : null,
        data.awaiting_verification > 0
          ? {
              key: 'awaiting',
              icon: 'hourglass-outline',
              tone: 'blue',
              title: `${data.awaiting_verification} waiting to be verified`,
              subtitle: 'Submitted — nothing for you to do',
              route: '/student/requirements',
            }
          : null,
        data.unread_notifications > 0
          ? {
              key: 'notices',
              icon: 'megaphone-outline',
              tone: 'blue',
              title: `${data.unread_notifications} unread notification${plural(data.unread_notifications)}`,
              subtitle: 'Announcements sent to your account',
              route: '/student/notifications',
            }
          : null,
      ]
    : [];

  const queue = queueRows.filter((row): row is QueueRow => row !== null);

  return (
    <View style={styles.screen}>
      <AppHeader
        hero
        title={data?.student_name ?? 'Student'}
        subtitle={data?.section ?? undefined}
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
            <SectionHeader title="Needs attention" detail="Work through these first" />
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
        ) : (
          <Card>
            <Text style={styles.quietLine}>
              Nothing needs your attention right now — every requirement is turned in.
            </Text>
          </Card>
        )}

        <View style={styles.section}>
          <SectionHeader
            title="Requirements"
            actionLabel="Open"
            onAction={() => router.push('/student/requirements')}
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
            actionLabel="Open"
            onAction={() => router.push('/student/attendance')}
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
              <Text style={styles.quietLine}>No attendance recorded yet.</Text>
            </Card>
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
  quietLine: { ...typography.muted },
});
