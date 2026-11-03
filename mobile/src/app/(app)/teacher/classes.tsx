/**
 * Teacher "My Classes" — the section-grouped hub the web app ships at
 * `/teacher/classes`.
 *
 * It was the largest gap between the two clients: the web app lists this screen
 * in `MOBILE_PRIMARY` for teachers (frontend/src/config/navigation.js), the Expo
 * app had no equivalent at all, and the dashboard's class rows opened the
 * timetable instead.
 *
 * Every number on this screen is derived from the six lists the teacher's own
 * token can already read (see `src/class-data.ts`) — the API exposes no
 * per-assignment counters, so the joins are done here, on foreign-key ids rather
 * than display labels. Two subjects in one section are two assignments and the
 * section's roster is counted once.
 */
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { router } from 'expo-router';

import { colors, spacing, radius, typography } from '../../../theme';
import { CLASS_STATUS, groupRowsBySection } from '../../../class-board';
import { useClassData } from '../../../class-data';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import AppHeader from '../../../components/ui/AppHeader';
import Badge from '../../../components/ui/Badge';
import StatTile from '../../../components/ui/StatTile';
import { formatMonthDay } from '../../../format';

export default function TeacherClassesScreen() {
  const { rows, loading, refreshing, error, reload, setRefreshing } = useClassData();

  if (loading) return <LoadingState label="Loading your classes…" />;
  if (error && rows.length === 0) {
    return <ErrorState message={error} onRetry={reload} />;
  }

  const groups = groupRowsBySection(rows);
  const students = new Set(rows.flatMap((row) => row.students.map((student) => student.id)));
  const pending = rows.reduce((sum, row) => sum + row.pendingCount, 0);

  return (
    <View style={styles.screen}>
      <AppHeader
        title="My Classes"
        subtitle={`${rows.length} ${rows.length === 1 ? 'assignment' : 'assignments'} across ${groups.length} ${groups.length === 1 ? 'section' : 'sections'}.`}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              reload();
            }}
            colors={[colors.blue]}
          />
        }
      >
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.grid}>
          <StatTile label="Subjects" value={rows.length} tone="navy" />
          <StatTile label="Sections" value={groups.length} tone="navy" />
          <StatTile label="Students" value={students.size} tone="navy" />
          <StatTile label="Awaiting review" value={pending} tone={pending > 0 ? 'amber' : 'navy'} />
        </View>

        <TouchableOpacity
          style={styles.linkRow}
          activeOpacity={0.8}
          accessibilityRole="link"
          accessibilityLabel="Open the full timetable"
          onPress={() => router.push('/teacher/timetable')}
        >
          <Text style={styles.linkRowLabel}>Full timetable</Text>
          <Text style={styles.linkRowChevron}>›</Text>
        </TouchableOpacity>

        {groups.length === 0 ? (
          <EmptyState
            inline
            title="No classes assigned"
            body="Assignments are created by the administrator on the web app; they appear here as soon as they exist."
          />
        ) : (
          groups.map((group) => (
            <View key={String(group.key)} style={styles.group}>
              <View style={styles.groupHead}>
                <View style={styles.groupHeadText}>
                  <Text style={styles.groupTitle}>{group.sectionLabel}</Text>
                  <Text style={styles.groupMeta}>
                    {[group.gradeLevelName, group.schoolYearLabel, group.adviserName && `Adviser: ${group.adviserName}`]
                      .filter(Boolean)
                      .join(' · ') || 'Section'}
                  </Text>
                </View>
                <Badge label={CLASS_STATUS[group.statusKey].label} tone={CLASS_STATUS[group.statusKey].tone} />
              </View>

              <Text style={styles.groupStats}>
                {group.studentCount} {group.studentCount === 1 ? 'student' : 'students'} ·{' '}
                {group.requirementCount}{' '}
                {group.requirementCount === 1 ? 'requirement' : 'requirements'} posted
                {group.attendance.presentRate !== null
                  ? ` · ${group.attendance.presentRate}% present over ${group.attendance.sessionCount} ${group.attendance.sessionCount === 1 ? 'session' : 'sessions'}`
                  : ' · no attendance marked'}
              </Text>

              {group.students.length === 0 ? (
                <Text style={styles.groupEmpty}>
                  Nobody is enrolled in {group.sectionLabel} yet, so no roster or record exists for
                  these subjects.
                </Text>
              ) : null}

              {group.subjects.map((row) => (
                <TouchableOpacity
                  key={row.id}
                  style={styles.card}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${row.subjectName}, ${row.sectionLabel}`}
                  onPress={() => router.push(`/teacher/classes/${row.id}`)}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {row.subjectName}
                    </Text>
                    <Badge
                      label={CLASS_STATUS[row.statusKey].label}
                      tone={CLASS_STATUS[row.statusKey].tone}
                      glyph={false}
                    />
                  </View>
                  <Text style={styles.cardMeta}>
                    {row.studentCount} students · {row.requirementCount} requirements
                    {row.pendingCount > 0 ? ` · ${row.pendingCount} awaiting review` : ''}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {row.nextDeadline
                      ? `Next: ${row.nextDeadline.title} — ${formatMonthDay(row.nextDeadline.deadline)}`
                      : row.requirementCount > 0
                        ? 'No open deadlines'
                        : 'Nothing posted yet'}
                    {row.attendance.presentRate !== null
                      ? ` · ${row.attendance.presentRate}% present`
                      : ''}
                  </Text>
                </TouchableOpacity>
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
  scroll: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  errorText: { ...typography.muted, color: colors.redText },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  linkRowLabel: { ...typography.body, fontWeight: '700', color: colors.blue },
  linkRowChevron: { ...typography.body, fontSize: 18, color: colors.textMuted },
  group: { gap: spacing.sm },
  groupHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  groupHeadText: { flexShrink: 1 },
  groupTitle: { ...typography.heading, color: colors.navy },
  groupMeta: { ...typography.subtle, marginTop: 2 },
  groupStats: { ...typography.subtle, color: colors.textMuted },
  groupEmpty: { ...typography.subtle, color: colors.amberText },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  cardTitle: { ...typography.heading, color: colors.text, flexShrink: 1 },
  cardMeta: { ...typography.subtle },
});
