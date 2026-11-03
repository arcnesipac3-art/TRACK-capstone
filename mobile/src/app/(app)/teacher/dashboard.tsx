/**
 * Teacher dashboard — GET /dashboard/ for role=teacher.
 *
 * Composed the way Khan Academy composes a home screen: the queue the teacher
 * has to work comes first, then one section per subject with a single blue
 * action that opens the full screen. Real payload fields only: assigned classes,
 * pending verifications, submission status counts, upcoming deadlines, recent
 * submissions and the attendance summary (see api/types.ts TeacherDashboard).
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import { router } from 'expo-router';

import { colors, spacing, typography } from '../../../theme';
import type { Tone } from '../../../theme';
import { formatMonthDay } from '../../../format';
import { submissionStatusMeta } from '../../../status';
import { api, ApiError } from '../../../api/client';
import type { TeacherDashboard } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import HeaderActions from '../../../components/ui/HeaderActions';
import AppHeader from '../../../components/ui/AppHeader';
import Badge from '../../../components/ui/Badge';
import Card from '../../../components/ui/Card';
import ListRow from '../../../components/ui/ListRow';
import ProgressBar from '../../../components/ui/ProgressBar';
import SectionHeader from '../../../components/ui/SectionHeader';
import StatTile from '../../../components/ui/StatTile';

type Tile = { label: string; value: number; tone: 'navy' | 'green' | 'amber' | 'red' };

/** Screens the attention queue can open. */
type TeacherQueueRoute = '/teacher/review' | '/teacher/classes' | '/teacher/attendance' | '/teacher/notices';

type QueueRow = {
  key: string;
  icon: 'hourglass-outline' | 'alert-circle-outline' | 'calendar-outline' | 'megaphone-outline';
  tone: Tone;
  title: string;
  subtitle: string;
  route: TeacherQueueRoute;
};

const plural = (n: number) => (n === 1 ? '' : 's');

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
        { label: 'Pending check', value: data.pending_verification, tone: 'amber' },
        { label: 'Verified', value: data.submission_status.verified, tone: 'green' },
        { label: 'Returned', value: data.submission_status.returned, tone: 'amber' },
        { label: 'No submission', value: data.submission_status.none, tone: 'navy' },
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

  const passedDeadlines = data ? data.upcoming_deadlines.filter((d) => d.is_overdue).length : 0;

  /**
   * The queue, in the order a teacher works it.
   *
   * Only the rows the server says are non-empty appear, so a caught-up teacher
   * opens on a quiet card instead of four zeros dressed up as tasks.
   */
  const queueRows: (QueueRow | null)[] = data
    ? [
        data.pending_verification > 0
          ? {
              key: 'review',
              icon: 'hourglass-outline',
              tone: 'amber',
              title: `${data.pending_verification} submission${plural(data.pending_verification)} waiting to be verified`,
              subtitle: 'Review queue',
              route: '/teacher/review',
            }
          : null,
        passedDeadlines > 0
          ? {
              key: 'deadlines',
              icon: 'alert-circle-outline',
              tone: 'red',
              title: `${passedDeadlines} deadline${plural(passedDeadlines)} passed`,
              subtitle: 'Requirements still open past their due date',
              route: '/teacher/classes',
            }
          : null,
        data.attendance.by_status.absent > 0
          ? {
              key: 'absent',
              icon: 'calendar-outline',
              tone: 'red',
              title: `${data.attendance.by_status.absent} absent mark${plural(data.attendance.by_status.absent)} on record`,
              subtitle: 'Attendance register',
              route: '/teacher/attendance',
            }
          : null,
        data.unread_notifications > 0
          ? {
              key: 'notices',
              icon: 'megaphone-outline',
              tone: 'blue',
              title: `${data.unread_notifications} unread notification${plural(data.unread_notifications)}`,
              subtitle: 'Announcements sent to your account',
              route: '/teacher/notices',
            }
          : null,
      ]
    : [];

  const queue = queueRows.filter((row): row is QueueRow => row !== null);

  return (
    <View style={styles.screen}>
      <AppHeader
        hero
        title={data?.teacher_name ?? 'Teacher'}
        subtitle="Your classes at a glance."
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
        ) : (
          <Card>
            <Text style={styles.quietLine}>Nothing is waiting on you — the review queue is clear.</Text>
          </Card>
        )}

        <View style={styles.section}>
          <SectionHeader title="At a glance" detail="Across your assigned classes" />
          <View style={styles.grid}>
            {stats.map((item) => (
              <StatTile key={item.label} label={item.label} value={item.value} tone={item.tone} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="Attendance"
            actionLabel="Register"
            onAction={() => router.push('/teacher/attendance')}
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

        <View style={styles.section}>
          <SectionHeader
            title="My classes"
            actionLabel="All"
            onAction={() => router.push('/teacher/classes')}
          />
          {data?.classes.length ? (
            <Card padded={false} style={styles.stack}>
              {data.classes.map((c, index) => (
                <ListRow
                  key={c.id}
                  icon="school-outline"
                  title={c.subject}
                  subtitle={c.section}
                  divider={index < data.classes.length - 1}
                  onPress={() => router.push(`/teacher/classes/${c.id}`)}
                />
              ))}
            </Card>
          ) : (
            <EmptyState inline title="No classes yet" body="Assigned classes will appear here." />
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader title="Upcoming deadlines" detail="Next due dates on your requirements" />
          {data?.upcoming_deadlines.length ? (
            <Card padded={false} style={styles.stack}>
              {data.upcoming_deadlines.map((d, index) => (
                <ListRow
                  key={d.id}
                  icon="time-outline"
                  tone={d.is_overdue ? 'red' : 'blue'}
                  title={d.title}
                  subtitle={`${d.subject} · ${d.section}${d.is_overdue ? ' · Overdue' : ''}`}
                  meta={formatMonthDay(d.deadline)}
                  chevron={false}
                  divider={index < data.upcoming_deadlines.length - 1}
                />
              ))}
            </Card>
          ) : (
            <EmptyState inline title="No upcoming deadlines" body="Nothing due soon." />
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="Recent submissions"
            actionLabel="Review"
            onAction={() => router.push('/teacher/review')}
          />
          {data?.recent_activity.length ? (
            <Card padded={false} style={styles.stack}>
              {data.recent_activity.map((a, index) => {
                const meta = submissionStatusMeta(a.status, false, 'reviewer');
                return (
                  <ListRow
                    key={a.id}
                    icon="cloud-upload-outline"
                    tone={meta.tone}
                    title={a.requirement_title}
                    subtitle={a.student_name}
                    trailing={<Badge label={meta.label} tone={meta.tone} glyph={false} />}
                    chevron={false}
                    divider={index < data.recent_activity.length - 1}
                  />
                );
              })}
            </Card>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  /** Rows inside a card carry their own separators so they read as one list. */
  stack: { gap: 0 },
  quietLine: { ...typography.muted },
});
