/**
 * Teacher class workspace — one assignment: overview, roster, grades.
 *
 * The mobile counterpart of `/teacher/classes/:assignmentId` in the web app, and
 * it reports the same thing the web reports: TRACK stores no scores. There is no
 * grade field on any model and no endpoint that computes one, so "grades" here
 * means the verification state each student's work is actually in — awaiting,
 * verified, returned, overdue, or missing after a closed deadline — plus the
 * attendance rate the server itself would derive. Anything else would be a
 * number the database cannot support.
 *
 * The class is resolved from the teacher-scoped rows (`/teacher-assignments/`),
 * so an id that is not one of this teacher's assignments never opens a record.
 */
import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, typography } from '../../../../theme';
import { formatDate } from '../../../../format';
import {
  CLASS_STATUS,
  buildClassBoard,
  gradeCellOf,
  type BoardStudent,
} from '../../../../class-board';
import { useClassData } from '../../../../class-data';
import { EmptyState, ErrorState, LoadingState } from '../../../../components/StateViews';
import AppHeader from '../../../../components/ui/AppHeader';
import BackLink from '../../../../components/ui/BackLink';
import Badge from '../../../../components/ui/Badge';
import SegmentedControl from '../../../../components/ui/SegmentedControl';
import StatTile from '../../../../components/ui/StatTile';

type Segment = 'overview' | 'students' | 'grades';

const SEGMENTS: { label: string; value: Segment }[] = [
  { label: 'Overview', value: 'overview' },
  { label: 'Students', value: 'students' },
  { label: 'Grades', value: 'grades' },
];

const CELL_RULES = [
  { tone: 'green' as const, label: 'Verified', text: 'on record and accepted' },
  { tone: 'amber' as const, label: 'Awaiting', text: 'handed in, not checked yet' },
  { tone: 'red' as const, label: 'Returned', text: 'sent back for revision' },
  { tone: 'red' as const, label: 'Missing', text: 'nothing on record after the deadline' },
  { tone: 'gray' as const, label: '—', text: 'the deadline is still open' },
];

function rate(value: number | null) {
  return value === null ? '—' : `${value}%`;
}

/** One student's record: their tallies, expandable to the state per requirement. */
function StudentRecord({ student, children }: { student: BoardStudent; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.record}>
      <TouchableOpacity
        style={styles.recordHead}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${student.name}, ${student.tally.submitted} handed in, ${student.tally.verified} verified`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
      >
        <View style={styles.recordName}>
          <Text style={styles.recordTitle} numberOfLines={2}>
            {student.name}
          </Text>
          {student.lrn ? <Text style={styles.recordLrn}>{student.lrn}</Text> : null}
        </View>
        <View style={styles.recordRight}>
          <Text style={styles.recordRate}>{rate(student.attendanceRate)}</Text>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
          />
        </View>
      </TouchableOpacity>

      <View style={styles.chips}>
        <Badge label={`${student.tally.verified} verified`} tone="green" glyph={false} />
        <Badge label={`${student.tally.pending} awaiting`} tone="amber" glyph={false} />
        <Badge label={`${student.tally.returned} returned`} tone="red" glyph={false} />
        <Badge label={`${student.tally.missing} missing`} tone="gray" glyph={false} />
      </View>

      {open ? <View style={styles.recordBody}>{children}</View> : null}
    </View>
  );
}

export default function TeacherClassWorkspaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [segment, setSegment] = useState<Segment>('overview');
  const { rows, submissions, loading, refreshing, error, reload, setRefreshing } = useClassData();

  if (loading) return <LoadingState label="Loading this class…" />;
  if (error && rows.length === 0) return <ErrorState message={error} onRetry={reload} />;

  const board = buildClassBoard({ rows, assignmentId: id, submissions });
  if (!board) {
    // The id came from the URL, and it is not one of this teacher's assignments.
    // Nothing is fetched for it: the rows this resolves against only ever came
    // back from the teacher-scoped endpoint.
    return (
      <ErrorState
        message="That class is not one of your assignments."
        retryLabel="Back to My Classes"
        onRetry={() => router.replace('/teacher/classes')}
      />
    );
  }

  const { row, requirements, students, attendance, indicators, sessions } = board;
  const status = CLASS_STATUS[row.statusKey];

  return (
    <View style={styles.screen}>
      <AppHeader
        eyebrow={`${row.sectionLabel}${row.gradeLevelName ? ` · ${row.gradeLevelName}` : ''}`}
        title={row.subjectName}
        subtitle={row.schoolYearLabel ?? undefined}
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
        <BackLink label="My Classes" onPress={() => router.push('/teacher/classes')} />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.statusRow}>
          <Badge label={status.label} tone={status.tone} />
          <Text style={styles.statusMeta}>
            {row.studentCount} students · {row.requirementCount} requirements
          </Text>
        </View>

        <SegmentedControl options={SEGMENTS} value={segment} onChange={setSegment} />

        {segment === 'overview' ? (
          <>
            <View style={styles.grid}>
              <StatTile label="Students" value={row.studentCount} tone="navy" />
              <StatTile label="Requirements" value={row.requirementCount} tone="navy" />
              <StatTile
                label="Awaiting review"
                value={indicators.pending}
                tone={indicators.pending > 0 ? 'amber' : 'navy'}
              />
              <StatTile
                label="Present rate"
                value={rate(attendance.presentRate)}
                tone={attendance.presentRate === null ? 'navy' : 'green'}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>This class</Text>
              <Text style={styles.body}>
                {attendance.sessionCount > 0
                  ? `${attendance.sessionCount} attendance ${attendance.sessionCount === 1 ? 'session' : 'sessions'} marked, most recently ${formatDate(attendance.lastDate)}. `
                  : 'No attendance marked yet. '}
                {`${attendance.recorded} marks on record: ${attendance.present} present, ${attendance.absent} absent, ${attendance.late} late, ${attendance.excused} excused.`}
                {attendance.incomplete > 0
                  ? ` ${attendance.incomplete} ${attendance.incomplete === 1 ? 'session has' : 'sessions have'} fewer marks than students enrolled.`
                  : ''}
              </Text>
              {row.adviserName ? (
                <Text style={styles.muted}>Adviser of record: {row.adviserName}</Text>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Deadlines</Text>
              {requirements.length === 0 ? (
                <EmptyState
                  inline
                  title="Nothing posted to this class"
                  body="Requirements you post for this assignment appear here with their state."
                />
              ) : (
                requirements.map((requirement) => (
                  <View key={requirement.id} style={styles.listCard}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.listTitle} numberOfLines={2}>
                        {requirement.title}
                      </Text>
                      <Badge
                        label={requirement.state === 'open' ? 'Open' : 'Closed'}
                        tone={requirement.state === 'open' ? 'blue' : 'gray'}
                        glyph={false}
                      />
                    </View>
                    <Text style={styles.listMeta}>
                      Due {formatDate(requirement.deadline)} · {requirement.handedIn}/
                      {row.studentCount} handed in
                      {requirement.verifiedRate !== null
                        ? ` · ${requirement.verifiedRate}% verified`
                        : ''}
                      {requirement.pendingCount > 0 ? ` · ${requirement.pendingCount} to check` : ''}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.action}
                activeOpacity={0.8}
                accessibilityRole="button"
                onPress={() => router.push('/teacher/attendance')}
              >
                <Text style={styles.actionLabel}>Record attendance</Text>
              </TouchableOpacity>
              {indicators.pending > 0 ? (
                <TouchableOpacity
                  style={[styles.action, styles.actionPrimary]}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  onPress={() => router.push('/teacher/review')}
                >
                  <Text style={[styles.actionLabel, styles.actionPrimaryLabel]}>
                    Verify {indicators.pending}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.action}
                activeOpacity={0.8}
                accessibilityRole="button"
                onPress={() => router.push('/teacher/timetable')}
              >
                <Text style={styles.actionLabel}>Timetable</Text>
              </TouchableOpacity>
            </View>

            {sessions.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Attendance sessions</Text>
                {sessions.slice(0, 6).map((session) => (
                  <View key={session.id} style={styles.listCard}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.listTitle}>{formatDate(session.date)}</Text>
                      <Badge
                        label={session.complete ? 'Complete' : `${session.recorded}/${row.studentCount}`}
                        tone={session.complete ? 'green' : 'amber'}
                        glyph={false}
                      />
                    </View>
                    <Text style={styles.listMeta}>
                      {session.present} present · {session.absent} absent · {session.late} late ·{' '}
                      {session.excused} excused
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {segment === 'students' ? (
          students.length === 0 ? (
            <EmptyState
              inline
              title="No students enrolled"
              body={`${row.sectionLabel} has no students on record, so this class has nobody to mark. Enrollment is managed on the web app.`}
            />
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Roster — {students.length} {students.length === 1 ? 'student' : 'students'}
              </Text>
              {students.map((student) => (
                <View key={student.id} style={styles.listCard}>
                  <Text style={styles.listTitle}>{student.name}</Text>
                  <Text style={styles.listMeta}>
                    {student.lrn ? `${student.lrn} · ` : ''}
                    {student.tally.submitted} handed in · {student.tally.verified} verified ·{' '}
                    {rate(student.attendanceRate)} present
                  </Text>
                </View>
              ))}
            </View>
          )
        ) : null}

        {segment === 'grades' ? (
          <>
            <View style={styles.note}>
              <Text style={styles.noteBody}>
                {row.subjectName} — {row.sectionLabel} is reported the way TRACK records it: by
                verification state, not by a score. There is no grade field on any model here, so a
                percentage would be a number the database cannot support. Each state below is the
                actual status of a student&apos;s submission for a requirement posted to this class.
              </Text>
              <View style={styles.rules}>
                {CELL_RULES.map((rule) => (
                  <View key={rule.label} style={styles.rule}>
                    <Badge label={rule.label} tone={rule.tone} glyph={false} />
                    <Text style={styles.ruleText}>{rule.text}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.noteBody}>
                Attendance is the same story: {attendance.sessionCount}{' '}
                {attendance.sessionCount === 1 ? 'session' : 'sessions'} marked for this class, and
                each rate is present marks over every mark on record — the rule the server itself
                uses.
              </Text>
            </View>

            {requirements.length === 0 ? (
              <EmptyState
                inline
                title="Nothing to report yet"
                body="No requirement has been posted to this class, so there is no work on record."
              />
            ) : students.length === 0 ? (
              <EmptyState
                inline
                title="No students enrolled"
                body={`${requirements.length} ${requirements.length === 1 ? 'requirement is' : 'requirements are'} posted, but nobody is enrolled in ${row.sectionLabel}.`}
              />
            ) : (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Class record</Text>
                <Text style={styles.muted}>
                  {indicators.handedIn} handed in · {indicators.verified} verified ·{' '}
                  {indicators.missingWork} missing after a closed deadline
                </Text>
                {students.map((student) => (
                  <StudentRecord key={student.id} student={student}>
                    {requirements.map((requirement) => {
                      const cell = gradeCellOf(requirement, student.id);
                      return (
                        <View key={requirement.id} style={styles.cellRow}>
                          <View style={styles.cellTitle}>
                            <Text style={styles.cellName} numberOfLines={2}>
                              {requirement.title}
                            </Text>
                            <Text style={styles.cellMeta}>
                              {formatDate(requirement.deadline)} · {requirement.handedIn}/
                              {students.length} in
                            </Text>
                          </View>
                          <Badge label={cell.label} tone={cell.tone} glyph={cell.key === 'open' ? false : true} />
                        </View>
                      );
                    })}
                    {attendance.sessionCount > 0 ? (
                      <Text style={styles.cellMeta}>
                        {student.marks
                          ? `Attendance: ${student.marks.present}/${student.marks.recorded} marks present (${rate(student.attendanceRate)})`
                          : 'No attendance marks for this student.'}
                      </Text>
                    ) : null}
                  </StudentRecord>
                ))}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  errorText: { ...typography.muted, color: colors.redText },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  statusMeta: { ...typography.subtle },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.label, color: colors.blue },
  body: { ...typography.body },
  muted: { ...typography.muted },
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
  listMeta: { ...typography.subtle },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  action: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.blue,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  actionPrimary: { backgroundColor: colors.blue, borderColor: colors.blue },
  actionLabel: { ...typography.body, fontWeight: '700', color: colors.blue },
  actionPrimaryLabel: { color: colors.onNavy },
  note: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  noteBody: { ...typography.subtle, lineHeight: 18 },
  rules: { gap: spacing.sm },
  rule: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ruleText: { ...typography.subtle, flexShrink: 1 },
  record: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  recordHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  recordName: { flexShrink: 1 },
  recordTitle: { ...typography.body, fontWeight: '700', color: colors.text },
  recordLrn: { ...typography.subtle, marginTop: 2 },
  recordRight: { alignItems: 'center', gap: 2 },
  recordRate: { ...typography.muted, fontWeight: '700', color: colors.navy },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  recordBody: { gap: 6, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  cellRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cellTitle: { flexShrink: 1 },
  cellName: { ...typography.body, color: colors.text },
  cellMeta: { ...typography.subtle },
});
