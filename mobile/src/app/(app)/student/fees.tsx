/**
 * Student Fee Summary — View own fee assessments and payment status.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';

import { colors, spacing, radius, typography } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import { countNoun, formatDate, formatPesoExact } from '../../../format';
import type { StudentFeeSummary, StudentFeeAssessment } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import AppHeader from '../../../components/ui/AppHeader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';

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

export default function StudentFeesScreen() {
  const [summary, setSummary] = useState<StudentFeeSummary | null>(null);
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
      setSummary(data[0] || null);
      setSchoolYears(sys);
      if (!schoolYearFilter && sys.length > 0) {
        setSchoolYearFilter(sys[0].id.toString());
      }
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load fee summary.');
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

  if (loading) return <LoadingState label="Loading fee summary…" />;
  if (error && !summary) {
    return (
      <ErrorState message={error} onRetry={onRefresh} />
    );
  }

  if (!summary) {
    return (
      <View style={styles.screen}>
        <AppHeader title="My Fees" subtitle="No fee data available" />
        <EmptyState
          inline
          title="No fee data"
          body="Your fee assessments will appear here once published."
        />
      </View>
    );
  }

  const sortAssessments = (assessments: StudentFeeAssessment[]) => {
    return [...assessments].sort((a, b) => {
      // Sort by payment status: unpaid first, then partial, then paid
      const statusOrder = { unpaid: 0, partial: 1, paid: 2 };
      const statusDiff = statusOrder[a.payment_status] - statusOrder[b.payment_status];
      if (statusDiff !== 0) return statusDiff;
      // Then by due date
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
  };

  const sortedAssessments = sortAssessments(summary.assessments);

  return (
    <View style={styles.screen}>
      <AppHeader
        hero
        title="My Fees"
        subtitle={`Total Outstanding: ${formatPesoExact(summary.total_outstanding)}`}
        right={
          <View style={styles.headerRight}>
            <Text style={styles.totalBadge}>Outstanding: {formatPesoExact(summary.total_outstanding)}</Text>
          </View>
        }
      />
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.blue]} />}
        contentContainerStyle={styles.content}
      >
        <View style={styles.summaryCards}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Assessed</Text>
            <Text style={styles.summaryValue}>{formatPesoExact(summary.total_assessed)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Paid</Text>
            <Text style={styles.summaryValuePaid}>{formatPesoExact(summary.total_paid)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Outstanding</Text>
            <Text style={styles.summaryValueOutstanding}>{formatPesoExact(summary.total_outstanding)}</Text>
          </View>
        </View>

        {schoolYears.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.label}>School Year</Text>
            <Text style={styles.muted}>{schoolYears.find(sy => sy.id.toString() === schoolYearFilter)?.label || 'Select school year'}</Text>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Fee Assessments</Text>
            <Text style={styles.sectionCount}>{countNoun(sortedAssessments.length, 'assessment')}</Text>
          </View>

          {sortedAssessments.length === 0 ? (
            <EmptyState inline title="No assessments" body="No fee assessments published for the selected period." />
          ) : (
            <View style={styles.list}>
              {sortedAssessments.map(assessment => (
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

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment History</Text>
            <Button variant="secondary" onPress={() => router.push('/student/fees/history')}>
              View All Payments
            </Button>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl },
  headerRight: { alignItems: 'flex-end' },
  totalBadge: { ...typography.subtle, color: colors.blue, backgroundColor: colors.blueWash, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.sm },
  summaryCards: { flexDirection: 'row', gap: spacing.md },
  summaryCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: spacing.xs },
  summaryLabel: { ...typography.label },
  summaryValue: { ...typography.heading, color: colors.navy },
  summaryValuePaid: { ...typography.heading, color: colors.greenText },
  summaryValueOutstanding: { ...typography.heading, color: colors.redText },
  section: { gap: spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { ...typography.heading, color: colors.navy },
  sectionCount: { ...typography.subtle, color: colors.textMuted },
  label: { ...typography.label },
  muted: { ...typography.subtle },
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