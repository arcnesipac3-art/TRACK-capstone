/**
 * Admin dashboard — GET /dashboard/ for role=admin.
 *
 * The order an administrator actually works in: what is waiting (attention
 * queue), what can be done about it (shortcuts), the scale of the school
 * (people), the paper (requirements), the register (attendance), and finally
 * what happened last (activity).
 *
 * Everything on the page is read from the one endpoint the web AdminDashboard
 * uses — no figure is derived that the API did not send, and a row the server
 * reports as empty is not shown at all.
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, RefreshControl, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, tones, typography } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import { countNoun, formatDateWithWeekday, formatPeso, formatRelativeTime } from '../../../format';
import type { AdminDashboard } from '../../../api/types';
import { useSessionUser } from '../../../session-user';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import AppHeader from '../../../components/ui/AppHeader';
import Card from '../../../components/ui/Card';
import HeaderActions from '../../../components/ui/HeaderActions';
import ListRow from '../../../components/ui/ListRow';
import MetricsCard from '../../../components/ui/MetricsCard';
import QuickActions from '../../../components/ui/QuickActions';
import type { QuickAction } from '../../../components/ui/QuickActions';
import ProgressBar from '../../../components/ui/ProgressBar';
import Screen from '../../../components/ui/Screen';
import SectionHeader from '../../../components/ui/SectionHeader';
import type { Tone } from '../../../theme';

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

function greeting(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function AdminDashboardScreen() {
  const user = useSessionUser();
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

  const firstName = user?.first_name?.trim();
  const schoolYear = data?.blocks?.structure?.active_school_year;
  const header = (
    <AppHeader
      hero
      eyebrow={`${greeting(new Date().getHours())}${firstName ? `, ${firstName}` : ''}`}
      title="Administration"
      subtitle={
        schoolYear
          ? `${formatDateWithWeekday(new Date())} · SY ${schoolYear}`
          : formatDateWithWeekday(new Date())
      }
      right={<HeaderActions />}
    />
  );

  if (loading) {
    return (
      <Screen header={header}>
        <LoadingState label="Loading dashboard…" rows={4} />
      </Screen>
    );
  }

  if (error && !data) {
    return (
      <Screen header={header}>
        <ErrorState
          message={error}
          onRetry={() => {
            setLoading(true);
            load();
          }}
        />
      </Screen>
    );
  }

  /**
   * The queue, in the order it is worked. A clean school gets one quiet line
   * that says so, because an empty panel that still looks urgent is worse than
   * no panel.
   */
  const queue: QueueRow[] = data
    ? [
        data.submission_status.submitted > 0
          ? {
              key: 'review',
              icon: 'hourglass-outline',
              tone: 'amber',
              title: `${countNoun(
                data.submission_status.submitted,
                'submission'
              )} waiting to be verified`,
              subtitle: 'Requirements queue',
              route: '/admin/requirements',
            }
          : null,
        data.unread_notifications > 0
          ? {
              key: 'notices',
              icon: 'notifications-outline',
              tone: 'blue',
              title: countNoun(data.unread_notifications, 'unread notification'),
              subtitle: 'Announcements sent to your account',
              route: '/admin/notices',
            }
          : null,
        data.attendance.by_status.absent > 0
          ? {
              key: 'absent',
              icon: 'alert-circle-outline',
              tone: 'red',
              title: `${countNoun(data.attendance.by_status.absent, 'absent mark')} on record`,
              subtitle: 'Attendance register',
              route: '/admin/attendance',
            }
          : null,
      ].filter((row): row is QueueRow => row !== null)
    : [];

  const shortcuts: QuickAction[] = [
    {
      key: 'attendance',
      label: 'Attendance register',
      icon: 'clipboard-outline',
      tone: 'navy',
      onSelect: () => router.push('/admin/attendance'),
    },
    {
      key: 'review',
      label: 'Review submissions',
      icon: 'hourglass-outline',
      tone: queue.some((r) => r.key === 'review') ? 'amber' : 'gray',
      detail:
        data && data.submission_status.submitted > 0
          ? `${data.submission_status.submitted} waiting`
          : undefined,
      onSelect: () => router.push('/admin/requirements'),
    },
    {
      key: 'assessment',
      label: 'New fee assessment',
      icon: 'cash-outline',
      tone: 'green',
      onSelect: () => router.push('/admin/fees/assessment/new'),
    },
    {
      key: 'directory',
      label: 'Student directory',
      icon: 'people-outline',
      tone: 'blue',
      onSelect: () => router.push('/admin/directory'),
    },
    {
      key: 'account',
      label: 'Add an account',
      icon: 'person-add-outline',
      tone: 'violet',
      onSelect: () => router.push('/admin/accounts'),
    },
    {
      key: 'notices',
      label: 'Announcements',
      icon: 'megaphone-outline',
      tone: 'teal',
      detail:
        data && data.unread_notifications > 0 ? `${data.unread_notifications} unread` : undefined,
      onSelect: () => router.push('/admin/notices'),
    },
  ];

  const attendance = data?.attendance;
  const today = data?.blocks?.attendance_today;
  const fees = data?.blocks?.fees;
  const todayLine = today
    ? today.total_records > 0
      ? `${today.by_status.present} present of ${today.total_records} marks recorded today`
      : 'Nothing marked present yet today.'
    : null;
  const mix = attendance
    ? [
        { key: 'present', label: 'Present', value: attendance.by_status.present, tone: 'green' as Tone },
        { key: 'absent', label: 'Absent', value: attendance.by_status.absent, tone: 'red' as Tone },
        { key: 'late', label: 'Late', value: attendance.by_status.late, tone: 'amber' as Tone },
        { key: 'excused', label: 'Excused', value: attendance.by_status.excused, tone: 'blue' as Tone },
      ]
    : [];

  return (
    <Screen header={header}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            colors={[colors.blue]}
            tintColor={colors.blue}
          />
        }
      >
        <QuickActions actions={shortcuts} />

        <View style={styles.section}>
          <SectionHeader
            title="Needs attention"
            count={queue.length}
            countNoun={queue.length === 1 ? 'item' : 'items'}
            countTone={queue.length ? 'amber' : 'green'}
          />
          {queue.length ? (
            <Card padded={false} variant="well">
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
          ) : (
            <Card compact>
              <View style={styles.clear}>
                <View style={styles.clearDisc}>
                  <Ionicons name="checkmark-outline" size={17} color={tones.green.text} />
                </View>
                <View style={styles.clearBody}>
                  <Text style={styles.clearTitle}>Nothing needs your attention</Text>
                  <Text style={styles.clearLine}>
                    No submissions awaiting a decision, no unread notices and no absence flagged.
                  </Text>
                </View>
              </View>
            </Card>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="People"
            actionLabel="Directory"
            onAction={() => router.push('/admin/directory')}
          />
          <MetricsCard
            lead
            onPress={() => router.push('/admin/directory')}
            footnote={data ? `${data.total_users} accounts on record` : undefined}
            items={[
              { key: 'students', label: 'Students', value: `${data?.total_students ?? 0}`, tone: 'navy' },
              { key: 'teachers', label: 'Teachers', value: `${data?.total_teachers ?? 0}`, tone: 'blue' },
              { key: 'parents', label: 'Parents', value: `${data?.total_parents ?? 0}`, tone: 'teal' },
              { key: 'sections', label: 'Sections', value: `${data?.total_sections ?? 0}`, tone: 'violet' },
            ]}
          />
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="Requirements"
            actionLabel="Open queue"
            onAction={() => router.push('/admin/requirements')}
          />
          <MetricsCard
            columns={3}
            lead
            onPress={() => router.push('/admin/requirements')}
            footnote={
              data
                ? `${data.active_requirements} of ${countNoun(data.total_requirements, 'requirement')} active`
                : undefined
            }
            items={[
              {
                key: 'awaiting',
                label: 'Awaiting verification',
                value: `${data?.submission_status.submitted ?? 0}`,
                tone: 'amber',
              },
              { key: 'verified', label: 'Verified', value: `${data?.submission_status.verified ?? 0}`, tone: 'green' },
              {
                key: 'none',
                label: 'Not submitted',
                value: `${data?.submission_status.none ?? 0}`,
                tone: 'gray',
              },
              { key: 'total', label: 'Total requirements', value: `${data?.total_requirements ?? 0}`, tone: 'navy' },
              {
                key: 'submissions',
                label: 'Submissions',
                value: `${data?.total_submissions ?? 0}`,
                tone: 'blue',
              },
            ]}
          />
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="Collections"
            actionLabel="Fee office"
            onAction={() => router.push('/admin/fees')}
          />
          {fees && fees.total_assessed > 0 ? (
            <Card style={styles.feesCard}>
              <View style={styles.feesHead}>
                <Text style={styles.feesCollected}>{formatPeso(fees.total_collected)}</Text>
                <Text style={styles.feesOf}>
                  collected of {formatPeso(fees.total_assessed)} assessed
                </Text>
              </View>
              <ProgressBar
                value={Math.min(100, (fees.total_collected / fees.total_assessed) * 100)}
                tone="navy"
                thickness="thick"
                detail={`${Math.round((fees.total_collected / fees.total_assessed) * 100)}%`}
              />
              <View style={styles.mix}>
                <View style={styles.mixCell}>
                  <View style={[styles.mixDot, { backgroundColor: tones.green.text }]} />
                  <Text style={styles.mixValue}>{formatPeso(fees.total_collected)}</Text>
                  <Text style={styles.mixLabel}>In hand</Text>
                </View>
                <View style={styles.mixCell}>
                  <View style={[styles.mixDot, { backgroundColor: tones.amber.text }]} />
                  <Text style={styles.mixValue}>{formatPeso(fees.total_outstanding)}</Text>
                  <Text style={styles.mixLabel}>Still owed</Text>
                </View>
                <View style={styles.mixCell}>
                  <View style={[styles.mixDot, { backgroundColor: tones.navy.text }]} />
                  <Text style={styles.mixValue}>{formatPeso(fees.total_assessed)}</Text>
                  <Text style={styles.mixLabel}>Assessed</Text>
                </View>
              </View>
            </Card>
          ) : (
            <EmptyState
              inline
              title="No fees assessed this year"
              body="Collection figures appear as soon as an assessment is published."
              icon="wallet-outline"
              actionLabel="Open fee office"
              onAction={() => router.push('/admin/fees')}
            />
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="Attendance"
            actionLabel="Register"
            onAction={() => router.push('/admin/attendance')}
          />
          {attendance && attendance.total_records > 0 ? (
            <Card style={styles.attendanceCard}>
              <ProgressBar
                value={attendance.present_rate ?? 0}
                label="Present rate"
                detail={countNoun(attendance.total_records, 'record')}
                tone="green"
                thickness="thick"
              />
              <View style={styles.mix}>
                {mix.map((row) => (
                  <View key={row.key} style={styles.mixCell}>
                    <View style={[styles.mixDot, { backgroundColor: tones[row.tone].text }]} />
                    <Text style={styles.mixValue}>{row.value}</Text>
                    <Text style={styles.mixLabel}>{row.label}</Text>
                  </View>
                ))}
              </View>
              {todayLine ? <Text style={styles.footnote}>{todayLine}</Text> : null}
            </Card>
          ) : (
            <EmptyState
              inline
              title="No attendance on record"
              body="The register fills as teachers take their sessions."
              icon="clipboard-outline"
              actionLabel="Open register"
              onAction={() => router.push('/admin/attendance')}
            />
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="Recent activity"
            count={data?.recent_activity.length}
            countNoun={data?.recent_activity.length === 1 ? 'action' : 'actions'}
            countTone="gray"
          />
          {data?.recent_activity.length ? (
            <Card padded={false}>
              {data.recent_activity.slice(0, 6).map((entry, index) => (
                <ListRow
                  key={entry.id}
                  icon="pulse-outline"
                  tone="gray"
                  title={entry.description}
                  subtitle={entry.actor ? `${entry.action} · ${entry.actor}` : entry.action}
                  meta={formatRelativeTime(entry.timestamp)}
                  divider={index < Math.min(data.recent_activity.length, 6) - 1}
                  chevron={false}
                />
              ))}
            </Card>
          ) : (
            <EmptyState inline title="No recent activity" body="School activity will appear here." />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.xl },
  section: { gap: spacing.md },
  attendanceCard: { gap: spacing.lg },
  feesCard: { gap: spacing.md },
  feesHead: { gap: spacing.xxs },
  feesCollected: { ...typography.figure, color: colors.text },
  feesOf: { ...typography.caption, color: colors.textSubtle },
  footnote: { ...typography.subtle, color: colors.textSubtle },
  mix: { flexDirection: 'row', gap: spacing.sm },
  mixCell: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  mixDot: { width: 6, height: 6, borderRadius: radius.pill },
  mixValue: { ...typography.heading, color: colors.text },
  mixLabel: { ...typography.subtle, color: colors.textSubtle },
  clear: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  clearDisc: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tones.green.background,
  },
  clearBody: { flex: 1, gap: spacing.xxs },
  clearTitle: { ...typography.bodyStrong, color: colors.text },
  clearLine: { ...typography.caption, color: colors.textSubtle },
});
