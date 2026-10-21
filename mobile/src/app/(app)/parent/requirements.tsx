/**
 * Parent requirements — read-only view of a linked child's assigned work.
 *
 * Child ids come from GET /students/ (StudentProfile pks) and are passed to
 * the API as `?child=<profile id>` — the parameter `_requirement_queryset_for`
 * and `SubmissionListCreateView` actually honour. The earlier version mixed
 * user ids with profile ids, so nothing ever matched, and fetched every
 * child's requirements at once.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import ScreenList from '../../../components/ScreenList';
import { useLocalSearchParams } from 'expo-router';
import { Picker } from '@react-native-picker/picker';

import { colors, spacing, radius, typography, type Tone } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import type { Requirement, Submission, StudentProfile } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import AppHeader from '../../../components/ui/AppHeader';
import Badge from '../../../components/ui/Badge';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelative(iso: string | null) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 864e5);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(iso);
}

function statusMeta(status: string, isOverdue: boolean): { label: string; tone: Tone } {
  switch (status) {
    case 'verified': return { label: 'Verified', tone: 'green' };
    case 'submitted': return { label: 'Awaiting verification', tone: 'blue' };
    case 'returned': return { label: 'Returned for revision', tone: 'red' };
    case 'overdue': return { label: 'Overdue', tone: 'red' };
    default: return isOverdue
      ? { label: 'Overdue', tone: 'red' }
      : { label: 'Not submitted', tone: 'gray' };
  }
}

function requirementTypeLabel(t: string) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

type Row = Requirement & {
  status: string;
  submission?: Submission;
  overdueDays: number;
};

export default function ParentRequirementsScreen() {
  const params = useLocalSearchParams<{ child?: string }>();
  const [children, setChildren] = useState<StudentProfile[]>([]);
  const [kidsLoaded, setKidsLoaded] = useState(false);
  const [kidsError, setKidsError] = useState<string | null>(null);
  const [kidsKey, setKidsKey] = useState(0);
  const [selectedChild, setSelectedChild] = useState<string | null>(params.child ?? null);
  const [loadedChild, setLoadedChild] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadedAt, setLoadedAt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Children list (once per kidsKey — retry re-runs it).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const kids = await api.list<StudentProfile>('/students/');
        if (!active) return;
        setChildren(kids);
        setKidsError(null);
        setSelectedChild((current) => {
          if (current) return current;
          if (params.child) return params.child;
          return kids.length > 0 ? String(kids[0].id) : null;
        });
      } catch (err) {
        if (active) {
          setKidsError(err instanceof ApiError ? err.message : 'Could not load your children.');
        }
      } finally {
        if (active) setKidsLoaded(true);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kidsKey]);

  // Requirements + submissions for the selected child (`?child=` takes a
  // StudentProfile pk — the id space /students/ returns).
  useEffect(() => {
    if (!selectedChild) return;
    let active = true;
    (async () => {
      try {
        const [reqs, subs] = await Promise.all([
          api.list<Requirement>('/requirements/', { params: { child: selectedChild } }),
          api.list<Submission>('/submissions/', { params: { child: selectedChild } }),
        ]);
        if (!active) return;
        setRequirements(reqs);
        setSubmissions(subs);
        setLoadedAt(Date.now());
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : 'Could not load requirements.');
        setRequirements([]);
        setSubmissions([]);
      } finally {
        if (active) {
          setLoadedChild(selectedChild);
          setRefreshing(false);
        }
      }
    })();
    return () => { active = false; };
  }, [selectedChild, reloadKey]);

  const onRefresh = () => {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
  };

  const retryKids = () => {
    setKidsLoaded(false);
    setKidsError(null);
    setKidsKey((k) => k + 1);
  };

  const retryData = () => {
    setLoadedChild(null);
    setError(null);
    setReloadKey((k) => k + 1);
  };

  const rows = useMemo<Row[]>(() => {
    if (loadedChild !== selectedChild) return [];
    const now = loadedAt || 0;
    // Server already scoped submissions to this child; index them by requirement.
    const subByReq = new Map(submissions.map((s) => [s.requirement, s]));
    return requirements
      .map((req) => {
        const sub = subByReq.get(req.id);
        let status = 'not_submitted';
        if (sub) status = sub.status;
        else if (req.is_overdue) status = 'overdue';
        const overdueDays = req.is_overdue
          ? Math.floor((now - new Date(req.deadline).getTime()) / 864e5)
          : 0;
        return { ...req, status, submission: sub, overdueDays };
      })
      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  }, [requirements, submissions, loadedAt, loadedChild, selectedChild]);

  if (!kidsLoaded) return <LoadingState label="Loading…" />;
  if (kidsError) return <ErrorState message={kidsError} onRetry={retryKids} />;
  if (children.length === 0) {
    return (
      <EmptyState
        title="No linked children"
        body="Ask your school registrar to link your account."
      />
    );
  }
  if (!selectedChild || loadedChild !== selectedChild) {
    return <LoadingState label="Loading requirements…" />;
  }

  const activeChild = children.find((c) => String(c.id) === selectedChild);

  // A failed child-scoped fetch clears the rows, so it surfaces here rather
  // than as an empty list masquerading as "no requirements".
  if (error) return <ErrorState message={error} onRetry={retryData} />;

  const subtitle = activeChild
    ? `${activeChild.user.full_name}${
        activeChild.section_name ? ` · ${activeChild.section_name}` : ''
      }`
    : undefined;

  return (
    <View style={styles.screen}>
      <AppHeader title="Requirements" subtitle={subtitle} />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.navy700]} />}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {children.length > 1 && (
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={selectedChild ?? undefined}
              onValueChange={(v: string) => setSelectedChild(v)}
              itemStyle={{ color: colors.text }}
              style={styles.picker}
              accessibilityLabel="Choose which child to view"
            >
              {children.map((c) => (
                <Picker.Item key={c.id} label={c.user.full_name} value={String(c.id)} />
              ))}
            </Picker>
          </View>
        )}

        {rows.length === 0 ? (
          <EmptyState
            inline
            title="No requirements"
            body={
              activeChild
                ? `No requirements posted for ${activeChild.user.full_name} yet.`
                : 'No requirements posted yet.'
            }
          />
        ) : (
          <ScreenList
            data={rows}
            keyExtractor={(item) => String(item.id)}
            renderItem={(item) => <RequirementRow item={item} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </ScrollView>
    </View>
  );
}

function RequirementRow({ item }: { item: Row }) {
  const meta = statusMeta(item.status, item.is_overdue);

  return (
    <View style={styles.card}>
      <View style={styles.rowTop}>
        <View style={styles.grow}>
          <Text style={styles.subject}>{item.subject_name}</Text>
          <Text style={styles.title}>{item.title}</Text>
        </View>
        <Badge label={meta.label} tone={meta.tone} />
      </View>
      <View style={styles.meta}>
        <Text style={styles.metaItem}>
          <Text style={styles.metaBold}>{requirementTypeLabel(item.requirement_type)}</Text>
        </Text>
        <Text style={styles.metaItem}>
          Due {formatDate(item.deadline)}
          {item.is_overdue && (
            <Text style={{ color: colors.red700, fontWeight: '600' }}> · Overdue by {item.overdueDays} days</Text>
          )}
        </Text>
        <Text style={styles.metaItem}>{item.section_name}</Text>
      </View>
      {item.submission?.submitted_at && (
        <Text style={styles.submittedLine}>Submitted {formatRelative(item.submission.submitted_at)}</Text>
      )}
      {item.submission?.teacher_feedback ? (
        <Text style={styles.feedback} numberOfLines={3}>
          Feedback: {item.submission.teacher_feedback}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  pickerWrapper: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  picker: { height: 48 },
  errorText: { ...typography.muted, color: colors.red700 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  grow: { flex: 1, minWidth: 0 },
  subject: { ...typography.label, color: colors.navy700 },
  title: { ...typography.heading, color: colors.text, marginTop: 2 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  metaItem: { ...typography.muted },
  metaBold: { fontWeight: '600' },
  submittedLine: { ...typography.subtle, color: colors.blue700 },
  feedback: {
    fontSize: 15,
    color: colors.textMuted,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  separator: { height: 1 },
});
