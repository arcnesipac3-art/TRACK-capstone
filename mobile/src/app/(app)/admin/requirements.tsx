/**
 * Admin requirements — school-wide read-only overview.
 *
 * GET /requirements/ (all) joined with GET /submissions/ (all) to show, per
 * requirement, how much work is in each state. Creating and editing
 * requirements stays on the web app; this screen is monitoring only.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import ScreenList from '../../../components/ScreenList';

import { colors, spacing, radius, typography } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import type { Requirement, Submission } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import AppHeader from '../../../components/ui/AppHeader';
import Badge from '../../../components/ui/Badge';

type RowData = Requirement & {
  total: number;
  submitted: number;
  verified: number;
  returned: number;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminRequirementsScreen() {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [reqs, subs] = await Promise.all([
        api.list<Requirement>('/requirements/'),
        api.list<Submission>('/submissions/'),
      ]);
      setRequirements(reqs);
      setSubmissions(subs);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load requirements.');
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

  const rows: RowData[] = requirements
    .map((req) => {
      const forReq = submissions.filter((s) => s.requirement === req.id);
      return {
        ...req,
        total: forReq.length,
        submitted: forReq.filter((s) => s.status === 'submitted').length,
        verified: forReq.filter((s) => s.status === 'verified').length,
        returned: forReq.filter((s) => s.status === 'returned').length,
      };
    })
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());

  if (loading) return <LoadingState label="Loading requirements…" />;
  if (error && requirements.length === 0) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  return (
    <View style={styles.screen}>
      <AppHeader title="Requirements" subtitle="Every published requirement and its progress." />
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.navy700]} />}
        contentContainerStyle={styles.content}
      >
        {error && <Text style={styles.errorText}>{error}</Text>}
        {rows.length === 0 ? (
          <EmptyState
            inline
            title="No requirements"
            body="Requirements posted by teachers will appear here."
          />
        ) : (
          <ScreenList
            data={rows}
            keyExtractor={(item) => String(item.id)}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={(item) => (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.grow}>
                    <Text style={styles.subject}>{item.subject_name}</Text>
                    <Text style={styles.title}>{item.title}</Text>
                  </View>
                  {item.is_overdue && <Badge label="Overdue" tone="red" />}
                </View>
                <Text style={styles.meta}>
                  {item.section_name} · Due {formatDate(item.deadline)}
                </Text>
                <View style={styles.counts}>
                  <View style={styles.countBadges}>
                    <Badge label={`${item.verified} verified`} tone="green" />
                    <Badge label={`${item.submitted} awaiting`} tone="amber" />
                    <Badge label={`${item.returned} returned`} tone="red" />
                  </View>
                  <Text style={styles.countSubtle}>
                    {item.total} of the class has submitted
                  </Text>
                </View>
              </View>
            )}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  errorText: { ...typography.muted, color: colors.red700 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  grow: { flex: 1, minWidth: 0 },
  subject: { ...typography.label, color: colors.navy700 },
  title: { ...typography.heading, color: colors.text, marginTop: 2 },
  meta: { ...typography.muted },
  counts: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  countBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  countSubtle: { ...typography.subtle },
  separator: { height: 1 },
});
