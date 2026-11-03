/**
 * Student submissions — history of everything the student has handed in.
 *
 * Read-only: review (verify/return) is the teacher's action; the backend
 * refuses status changes from students regardless of what this screen shows.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import ScreenList from '../../../components/ScreenList';

import { colors, spacing, radius, typography } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import type { Submission } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import AppHeader from '../../../components/ui/AppHeader';
import Badge from '../../../components/ui/Badge';
import { formatDateTimeFull } from '../../../format';
import { submissionStatusMeta } from '../../../status';

export default function StudentSubmissionsScreen() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.list<Submission>('/submissions/');
      setSubmissions(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your submissions.');
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

  if (loading) return <LoadingState label="Loading submissions…" />;
  if (error && submissions.length === 0) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  return (
    <View style={styles.screen}>
      <AppHeader title="Submissions" subtitle="Your submission history and feedback." />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.blue]} />}
        contentContainerStyle={styles.content}
      >
        {error && <Text style={styles.errorText}>{error}</Text>}
        {submissions.length === 0 ? (
          <EmptyState
            inline
            title="No submissions yet"
            body="Your submitted work will appear here."
          />
        ) : (
          <ScreenList
            data={submissions}
            keyExtractor={(item) => String(item.id)}
            renderItem={(item) => <SubmissionRow item={item} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </ScrollView>
    </View>
  );
}

function SubmissionRow({ item }: { item: Submission }) {
  const meta = submissionStatusMeta(item.status);

  return (
    <View style={styles.card}>
      <View style={styles.rowTop}>
        <View style={styles.grow}>
          <Text style={styles.title}>{item.requirement_title}</Text>
        </View>
        <Badge label={meta.label} tone={meta.tone} />
      </View>

      <View style={styles.details}>
        {item.submitted_at && <Text style={styles.detail}>Submitted {formatDateTimeFull(item.submitted_at)}</Text>}
        {item.verified_at && <Text style={[styles.detail, { color: colors.greenText }]}>Verified {formatDateTimeFull(item.verified_at)}</Text>}
      </View>

      {item.link_url ? <Text style={styles.link}>Link: {item.link_url}</Text> : null}
      {item.teacher_feedback ? (
        <Text style={styles.feedback} numberOfLines={3}>Feedback: {item.teacher_feedback}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  errorText: { ...typography.muted, color: colors.redText },
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
  title: { ...typography.heading, color: colors.text },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  detail: { ...typography.subtle },
  link: { ...typography.body, color: colors.blueText },
  feedback: {
    ...typography.muted,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  separator: { height: 1 },
});
