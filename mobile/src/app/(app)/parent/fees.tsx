/**
 * Parent Fee Summary — View children's fee assessments and payment status.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';

import { colors, spacing, radius, typography } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import { countNoun, formatDate, formatPesoExact } from '../../../format';
import type { StudentFeeSummary, StudentFeeAssessment } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import AppHeader from '../../../components/ui/AppHeader';
import Badge from '../../../components/ui/Badge';

type PaymentStatus = 'paid' | 'partial' | 'unpaid';

function getStatusConfig(status: PaymentStatus) {
  switch (status) {
    case 'paid':
      return { variant: 'green' as const, label: 'Paid', color: colors.greenText };
    case 'partial':
      return { variant: 'amber' as const, label: 'Partial', color: colors.amberText };
    default:
      return { variant: 'red' as const, label: 'Unpaid', color: colors.redText };
  }
}

export default function ParentFeesScreen() {
  const [summaries, setSummaries] = useState<StudentFeeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schoolYearFilter, setSchoolYearFilter] = useState<string>('');
  const [schoolYears, setSchoolYears] = useState<{id: number, label: string}[]>([]);

  const load = useCallback(async () => {
    try {
      const [data, sys] = await Promise.all([
        api.get<StudentFeeSummary[]>('/fee-summary/', { params: { school_year: schoolYearFilter || undefined } }),
        api.list<{id: number, label: string}>('/school-years/'),
      ]);
      setSummaries(data);
      setSchoolYears(sys);
      if (!schoolYearFilter && sys.length > 0) {
        setSchoolYearFilter(sys[0].id.toString());
      }
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load fee summaries.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [schoolYearFilter]);

  useEffect(() => {
    // Mount fetch — every setState in `load` runs after an await, which the
    // rule cannot see because it reads the call, not the schedule.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading) return <LoadingState label="Loading fee summaries…" />;
  if (error && !summaries.length) {
    return (
      <ErrorState message={error} onRetry={onRefresh} />
    );
  }

  const sortAssessments = (assessments: StudentFeeAssessment[]) => {
    return [...assessments].sort((a, b) => {
      const statusOrder = { unpaid: 0, partial: 1, paid: 2 };
      const statusDiff = statusOrder[a.payment_status] - statusOrder[b.payment_status];
      if (statusDiff !== 0) return statusDiff;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
  };

  return (
    <View style={styles.screen}>
      <AppHeader
        hero
        title="Children's Fees"
        subtitle={summaries.length > 0
          ? `${countNoun(summaries.length, 'child', 'children')} · Total Outstanding: ${formatPesoExact(summaries.reduce((a, b) => a + b.total_outstanding, 0))}`
          : 'No fee data available'}
      />
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.blue]} />}
        contentContainerStyle={styles.content}
      >
        {schoolYears.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.label}>School Year</Text>
            <Text style={styles.muted}>{schoolYears.find(sy => sy.id.toString() === schoolYearFilter)?.label || 'Select school year'}</Text>
          </View>
        )}

        {summaries.length === 0 ? (
          <EmptyState
            inline
            title="No fee data"
            body="Your children's fee assessments will appear here once published."
          />
        ) : (
          summaries.map((summary, idx) => (
            <View key={summary.id} style={styles.childSection}>
              <View style={styles.childHeader}>
                <View style={styles.childInfo}>
                  <Text style={styles.childName}>{summary.user.full_name}</Text>
                  <Text style={styles.childMeta}>
                    {summary.section_name} · LRN: {summary.lrn || 'N/A'}
                  </Text>
                </View>
                <View style={styles.childTotals}>
                  <View style={styles.childTotal}>
                    <Text style={styles.childTotalLabel}>Assessed</Text>
                    <Text style={styles.childTotalValue}>{formatPesoExact(summary.total_assessed)}</Text>
                  </View>
                  <View style={styles.childTotal}>
                    <Text style={styles.childTotalLabel}>Paid</Text>
                    <Text style={styles.childTotalValuePaid}>{formatPesoExact(summary.total_paid)}</Text>
                  </View>
                  <View style={styles.childTotal}>
                    <Text style={styles.childTotalLabel}>Outstanding</Text>
                    <Text style={styles.childTotalValueOutstanding}>{formatPesoExact(summary.total_outstanding)}</Text>
                  </View>
                </View>
              </View>

              {summary.assessments.length === 0 ? (
                <EmptyState inline title="No assessments" body="No fee assessments published for this period." />
              ) : (
                <View style={styles.list}>
                  {sortAssessments(summary.assessments).map(assessment => (
                    <View key={assessment.id} style={styles.listItem}>
                      <View style={styles.listItemLeft}>
                        <View style={styles.listItemHeader}>
                          <Text style={styles.listItemTitle}>{assessment.category}</Text>
                          <Badge
                            label={getStatusConfig(assessment.payment_status).label}
                            tone={getStatusConfig(assessment.payment_status).variant}
                          />
                        </View>
                        <Text style={styles.listItemSubtitle}>
                          {assessment.category_fee_type === 'voluntary' ? 'Voluntary · ' : 'Required · '}
                          Due {formatDate(assessment.due_date)}
                        </Text>
                        {assessment.description && (
                          <Text style={styles.listItemDesc}>{assessment.description}</Text>
                        )}
                      </View>
                      <View style={styles.listItemRight}>
                        <View style={styles.amountRow}>
                          <Text style={styles.assessedAmount}>Assessed: {formatPesoExact(assessment.amount)}</Text>
                          <Text style={[styles.paidAmount, { color: getStatusConfig(assessment.payment_status).color }]}>
                            Paid: {formatPesoExact(assessment.paid_amount)}
                          </Text>
                          <Text style={styles.outstandingAmount}>Balance: {formatPesoExact(assessment.outstanding)}</Text>
                        </View>
                        {assessment.receipt_number && (
                          <Text style={styles.receiptText}>Receipt: {assessment.receipt_number}</Text>
                        )}
                        {assessment.payment_date && (
                          <Text style={styles.receiptText}>Paid: {formatDate(assessment.payment_date)}</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )))
        }
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl },
  section: { gap: spacing.md },
  label: { ...typography.label },
  muted: { ...typography.subtle },
  childSection: { gap: spacing.md },
  childHeader: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  childInfo: { flex: 1, minWidth: 200 },
  childName: { ...typography.heading, color: colors.navy },
  childMeta: { ...typography.subtle, marginTop: 2 },
  childTotals: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  childTotal: { alignItems: 'flex-end' },
  childTotalLabel: { ...typography.label },
  childTotalValue: { ...typography.body, fontWeight: '700', color: colors.navy },
  childTotalValuePaid: { ...typography.body, fontWeight: '700', color: colors.greenText },
  childTotalValueOutstanding: { ...typography.body, fontWeight: '700', color: colors.redText },
  list: { gap: spacing.md },
  listItem: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  listItemLeft: { flex: 1 },
  listItemRight: { width: 140, alignItems: 'flex-end', gap: spacing.xs },
  listItemHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  listItemTitle: { ...typography.body, fontWeight: '700', color: colors.text },
  listItemSubtitle: { ...typography.subtle, marginTop: 2 },
  listItemDesc: { ...typography.subtle, marginTop: spacing.xs, fontStyle: 'italic' },
  amountRow: { gap: spacing.xs },
  assessedAmount: { ...typography.subtle, color: colors.text },
  paidAmount: { ...typography.subtle, fontWeight: '700' },
  outstandingAmount: { ...typography.subtle, fontWeight: '700', color: colors.redText },
  receiptText: { ...typography.subtle, color: colors.textMuted },
});