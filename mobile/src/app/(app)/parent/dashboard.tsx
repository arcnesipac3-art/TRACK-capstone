/**
 * Parent dashboard — aggregates across all linked children.
 *
 * Composed the way Khan Academy composes a home screen: the children with
 * something outstanding come first, then one block per child with its numbers
 * and two named rows that open the full screens. The numbers are read-only —
 * before this, all ten tiles per child were buttons and every one of them went
 * to the same two places, so the screen could not say which child needed a look.
 *
 * Shape verified live: `/dashboard/` for role=parent returns
 * `children: [{student_id, name, section, total_requirements, …,
 * attendance:{by_status:{…}}}]`. The earlier version expected a nested
 * `user` object that does not exist and crashed on first render.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { router } from 'expo-router';

import { colors, spacing, typography } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import type { ParentDashboard, ParentDashboardChild } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import HeaderActions from '../../../components/ui/HeaderActions';
import AppHeader from '../../../components/ui/AppHeader';
import Card from '../../../components/ui/Card';
import ListRow from '../../../components/ui/ListRow';
import ProgressBar from '../../../components/ui/ProgressBar';
import SectionHeader from '../../../components/ui/SectionHeader';
import StatTile from '../../../components/ui/StatTile';
import type { Tone } from '../../../theme';

type StatTone = 'navy' | 'green' | 'amber' | 'red';
type Tile = { label: string; value: number; tone: StatTone };

type QueueRow = {
  key: string;
  icon: 'alert-circle-outline' | 'document-text-outline' | 'megaphone-outline';
  tone: Tone;
  title: string;
  subtitle: string;
  route: `/parent/requirements?child=${number}` | '/parent/notifications';
};

const plural = (n: number) => (n === 1 ? '' : 's');

/** `2 past due · 1 not submitted`, skipping the parts that are zero. */
function outstandingLine(child: ParentDashboardChild): string {
  const parts = [
    child.overdue > 0 ? `${child.overdue} past due` : null,
    child.not_submitted > 0 ? `${child.not_submitted} not submitted` : null,
    child.returned > 0 ? `${child.returned} returned` : null,
  ].filter((p): p is string => p !== null);
  return parts.join(' · ');
}

export default function ParentDashboardScreen() {
  const [data, setData] = useState<ParentDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<ParentDashboard>('/dashboard/');
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

  const requirementTiles = (child: ParentDashboardChild): Tile[] => [
    { label: 'Total', value: child.total_requirements, tone: 'navy' },
    { label: 'Not submitted', value: child.not_submitted, tone: 'navy' },
    { label: 'Awaiting check', value: child.awaiting_verification, tone: 'amber' },
    { label: 'Verified', value: child.verified, tone: 'green' },
    { label: 'Returned', value: child.returned, tone: 'amber' },
    { label: 'Overdue', value: child.overdue, tone: 'red' },
  ];

  const attendanceTiles = (child: ParentDashboardChild): Tile[] => [
    { label: 'Present', value: child.attendance.by_status.present, tone: 'green' },
    { label: 'Absent', value: child.attendance.by_status.absent, tone: 'red' },
    { label: 'Late', value: child.attendance.by_status.late, tone: 'amber' },
    { label: 'Excused', value: child.attendance.by_status.excused, tone: 'navy' },
  ];

  /**
   * The queue: one row per child with work outstanding, then notices.
   *
   * A row's tone is the most serious thing on that child — an overdue
   * requirement reads red whether or not there is also returned work behind it.
   */
  const queueRows: (QueueRow | null)[] = data
    ? [
        ...data.children.map((child): QueueRow | null =>
          child.overdue > 0 || child.not_submitted > 0 || child.returned > 0
            ? {
                key: `child-${child.student_id}`,
                icon: child.overdue > 0 ? 'alert-circle-outline' : 'document-text-outline',
                tone: child.overdue > 0 ? 'red' : 'amber',
                title: child.name,
                subtitle: outstandingLine(child),
                route: `/parent/requirements?child=${child.student_id}`,
              }
            : null
        ),
        data.unread_notifications > 0
          ? {
              key: 'notices',
              icon: 'megaphone-outline',
              tone: 'blue',
              title: `${data.unread_notifications} unread notification${plural(data.unread_notifications)}`,
              subtitle: 'Announcements sent to your account',
              route: '/parent/notifications',
            }
          : null,
      ]
    : [];

  const queue = queueRows.filter((row): row is QueueRow => row !== null);

  return (
    <View style={styles.screen}>
      <AppHeader
        hero
        title={data?.parent_name ?? 'Parent'}
        subtitle="Your children in one place."
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
        {data && data.children.length > 0 ? (
          queue.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader title="Needs attention" detail="Open a child to work through it" />
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
          ) : null
        ) : null}

        {data?.children.map((child) => (
          <View key={child.student_id} style={styles.section}>
            <SectionHeader
              title={child.name}
              detail={child.section ?? 'No section on record'}
              actionLabel="My Children"
              onAction={() => router.push('/parent/children')}
            />

            <Card padded={false} style={styles.stack}>
              <ListRow
                icon="document-text-outline"
                title="Requirements"
                subtitle="Each assignment, its status and its deadline"
                meta={
                  child.not_submitted + child.overdue + child.returned > 0
                    ? `${child.not_submitted + child.overdue + child.returned} open`
                    : undefined
                }
                divider
                onPress={() => router.push(`/parent/requirements?child=${child.student_id}`)}
              />
              <ListRow
                icon="calendar-outline"
                title="Attendance"
                subtitle="Every session the school has recorded"
                onPress={() => router.push(`/parent/attendance?child=${child.student_id}`)}
              />
            </Card>

            <View style={styles.block}>
              <Text style={styles.blockTitle}>Requirements</Text>
              <View style={styles.grid}>
                {requirementTiles(child).map((item) => (
                  <StatTile key={item.label} label={item.label} value={item.value} tone={item.tone} />
                ))}
              </View>
            </View>

            <View style={styles.block}>
              <Text style={styles.blockTitle}>Attendance</Text>
              {child.attendance.total_records > 0 ? (
                <Card>
                  <ProgressBar
                    value={child.attendance.present_rate ?? 0}
                    label="Present rate"
                    detail={`${child.attendance.total_records} records`}
                    tone="green"
                  />
                  <View style={styles.grid}>
                    {attendanceTiles(child).map((item) => (
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
          </View>
        ))}

        {data && data.children.length === 0 && (
          <EmptyState
            inline
            title="No linked children"
            body="Ask your school registrar to link your account."
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl },
  section: { gap: spacing.md },
  block: { gap: spacing.sm },
  blockTitle: { ...typography.label, color: colors.textSubtle },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  /** Rows inside a card carry their own separators so they read as one list. */
  stack: { gap: 0 },
  quietLine: { ...typography.muted },
});
