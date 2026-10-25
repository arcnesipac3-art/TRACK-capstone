/**
 * Parent dashboard — aggregates across all linked children.
 *
 * Shape verified live: `/dashboard/` for role=parent returns
 * `children: [{student_id, name, section, total_requirements, …,
 * attendance:{by_status:{…}}}]`. The earlier version expected a nested
 * `user` object that does not exist and crashed on first render.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';

import { colors, spacing, radius, typography } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import type { ParentDashboard } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import SignOutButton from '../../../components/SignOutButton';
import AppHeader from '../../../components/ui/AppHeader';
import StatTile from '../../../components/ui/StatTile';

type StatTone = 'navy' | 'green' | 'amber' | 'red';
type Tile = { label: string; value: number; tone: StatTone };

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

  const requirementTiles = (child: ParentDashboard['children'][number]): Tile[] => [
    { label: 'Total', value: child.total_requirements, tone: 'navy' },
    { label: 'Not submitted', value: child.not_submitted, tone: 'navy' },
    { label: 'Awaiting check', value: child.awaiting_verification, tone: 'amber' },
    { label: 'Verified', value: child.verified, tone: 'green' },
    { label: 'Returned', value: child.returned, tone: 'amber' },
    { label: 'Overdue', value: child.overdue, tone: 'red' },
  ];

  const attendanceTiles = (child: ParentDashboard['children'][number]): Tile[] => [
    { label: 'Present', value: child.attendance.by_status.present, tone: 'green' },
    { label: 'Absent', value: child.attendance.by_status.absent, tone: 'red' },
    { label: 'Late', value: child.attendance.by_status.late, tone: 'amber' },
    { label: 'Excused', value: child.attendance.by_status.excused, tone: 'navy' },
  ];

  return (
    <View style={styles.screen}>
      <AppHeader
        hero
        title={data?.parent_name ?? 'Parent'}
        subtitle="Your children in one place."
        right={<SignOutButton variant="onNavy" />}
      />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.navy700]} />}
        contentContainerStyle={styles.content}
      >
        {data?.children.map((child) => (
          <View key={child.student_id} style={styles.childSection}>
            <View style={styles.childHeader}>
              <Text style={styles.childName}>{child.name}</Text>
              {child.section ? <Text style={styles.childSectionLabel}>{child.section}</Text> : null}
            </View>

            <View style={styles.subSection}>
              <Text style={styles.sectionTitle}>Requirements</Text>
              <View style={styles.grid}>
                {requirementTiles(child).map((item, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.tile}
                    activeOpacity={0.8}
                    onPress={() => router.push('/parent/requirements')}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${child.name}'s requirements — ${item.label}`}
                  >
                    <StatTile label={item.label} value={item.value} tone={item.tone} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.subSection}>
              <Text style={styles.sectionTitle}>Attendance</Text>
              <View style={styles.grid}>
                {attendanceTiles(child).map((item, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.tile}
                    activeOpacity={0.8}
                    onPress={() => router.push('/parent/attendance')}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${child.name}'s attendance — ${item.label}`}
                  >
                    <StatTile label={item.label} value={item.value} tone={item.tone} />
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.rate}>
                {child.attendance.total_records > 0
                  ? `Present rate: ${child.attendance.present_rate ?? 0}%`
                  : 'No attendance recorded yet.'}
              </Text>
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
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl },
  childSection: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.lg,
  },
  childHeader: { gap: 2 },
  childName: { ...typography.heading, color: colors.navy900 },
  childSectionLabel: { ...typography.muted },
  subSection: { gap: spacing.md },
  sectionTitle: { ...typography.label, color: colors.navy700 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { flexGrow: 1, flexBasis: '46%' },
  rate: { ...typography.muted },
});
