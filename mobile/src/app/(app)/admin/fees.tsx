/**
 * Admin fee management — the bursar's views over one set of endpoints.
 *
 * Overview, assessments, categories, payments and reports, all reading the same
 * data the web fees page reads: GET /fee-dashboard/, /fee-categories/,
 * /fee-assessments/, /fee-payments/ and /fee-reports/*. Nothing here is a mock:
 * a percentage is collected/assessed from the server's own figures, and a
 * category with no collections draws an empty bar rather than a hopeful one.
 *
 * The five views used to be five navy-tabbed copies of the same white-card list.
 * They now share one page: a scrollable switcher, one money picture at the top,
 * and each list built from the same row primitive, so a ₱ amount reads the same
 * way wherever it appears. The two editors stay on their own routes
 * (`/admin/fees/category/<id>`, `/admin/fees/assessment/<id>`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { colors, spacing, typography, type Tone } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import { formatDate, formatPeso } from '../../../format';
import type {
  FeeAssessment,
  FeeCategory,
  FeeDashboardSummary,
} from '../../../api/types';
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from '../../../components/StateViews';
import FeesPaymentsTab from '../../../components/FeesPaymentsTab';
import FeesReportsTab from '../../../components/FeesReportsTab';
import AppHeader from '../../../components/ui/AppHeader';
import Badge from '../../../components/ui/Badge';
import BarSeries from '../../../components/ui/BarSeries';
import Card from '../../../components/ui/Card';
import Chip from '../../../components/ui/Chip';
import Fab from '../../../components/ui/Fab';
import ListRow from '../../../components/ui/ListRow';
import MetricsCard from '../../../components/ui/MetricsCard';
import ProgressBar from '../../../components/ui/ProgressBar';
import Screen from '../../../components/ui/Screen';
import SearchField from '../../../components/ui/SearchField';
import SectionHeader from '../../../components/ui/SectionHeader';
import SegmentedControl from '../../../components/ui/SegmentedControl';

type Tab = 'overview' | 'assessments' | 'categories' | 'payments' | 'reports';
type AssessStatus = 'all' | FeeAssessment['status'];
type CatFilter = 'all' | FeeCategory['fee_type'];

const ASSESS_TONE: Record<FeeAssessment['status'], Tone> = {
  published: 'green',
  draft: 'amber',
  archived: 'gray',
};

/** `0.0661…` -> `7%`, and a zero target never reads as `NaN%`. */
function rate(collected: number, assessed: number): number {
  if (!assessed || assessed <= 0) return 0;
  return Math.round((collected / assessed) * 100);
}

/** Who an assessment is aimed at, in the fewest words the record allows. */
function scopeOf(assessment: FeeAssessment): string {
  const parts = [assessment.grade_level_name, assessment.section_name].filter(Boolean);
  if (assessment.student_name) parts.push(assessment.student_name);
  const scope = parts.length ? parts.join(' ') : 'Every student';
  return `${scope} · ${assessment.school_year_label}`;
}

export default function AdminFeesScreen() {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<FeeCategory[]>([]);
  const [catQuery, setCatQuery] = useState('');
  const [catFilter, setCatFilter] = useState<CatFilter>('all');

  const [assessments, setAssessments] = useState<FeeAssessment[]>([]);
  const [assessQuery, setAssessQuery] = useState('');
  const [assessFilter, setAssessFilter] = useState<AssessStatus>('all');

  const [dashboard, setDashboard] = useState<FeeDashboardSummary | null>(null);

  const load = useCallback(async () => {
    try {
      const [cats, asses, dash] = await Promise.all([
        api.list<FeeCategory>('/fee-categories/'),
        api.list<FeeAssessment>('/fee-assessments/'),
        api.get<FeeDashboardSummary>('/fee-dashboard/'),
      ]);
      setCategories(cats);
      setAssessments(asses);
      setDashboard(dash);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load fee data.');
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

  const assessCounts = useMemo(() => {
    const counts = { all: assessments.length, draft: 0, published: 0, archived: 0 };
    assessments.forEach((item) => {
      counts[item.status] += 1;
    });
    return counts;
  }, [assessments]);

  const catCounts = useMemo(() => {
    const counts = {
      all: categories.length,
      compulsory: 0,
      voluntary: 0,
    };
    categories.forEach((item) => {
      counts[item.fee_type] += 1;
    });
    return counts;
  }, [categories]);

  const visibleAssessments = useMemo(() => {
    const needle = assessQuery.trim().toLowerCase();
    return assessments.filter((item) => {
      if (assessFilter !== 'all' && item.status !== assessFilter) return false;
      if (!needle) return true;
      return `${item.category_name} ${item.category_code} ${item.student_name ?? ''} ${
        item.section_name ?? ''
      } ${item.grade_level_name ?? ''}`
        .toLowerCase()
        .includes(needle);
    });
  }, [assessments, assessFilter, assessQuery]);

  const visibleCategories = useMemo(() => {
    const needle = catQuery.trim().toLowerCase();
    return categories.filter((item) => {
      if (catFilter !== 'all' && item.fee_type !== catFilter) return false;
      if (!needle) return true;
      return `${item.name} ${item.code} ${item.description}`.toLowerCase().includes(needle);
    });
  }, [categories, catFilter, catQuery]);

  const bar = (
    <AppHeader
      title="Fees"
      eyebrow="Administration"
      subtitle={
        dashboard
          ? `${formatPeso(dashboard.total_outstanding)} outstanding over ${formatPeso(
              dashboard.total_assessed
            )} assessed`
          : 'Collections, assessments and balances.'
      }
    />
  );

  if (loading) {
    return (
      <Screen header={bar}>
        <LoadingState label="Loading fee management…" rows={5} />
      </Screen>
    );
  }

  if (error && categories.length === 0 && assessments.length === 0) {
    return (
      <Screen header={bar}>
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

  const ledger = dashboard;

  /**
   * The one write this module offers from a phone, placed where the thumb already
   * is. Payments and reports are read-only views, so the action is hidden rather
   * than offered where it means nothing.
   */
  const fabAction =
    tab === 'payments' || tab === 'reports'
      ? null
      : tab === 'categories'
        ? {
            key: 'category',
            label: 'New fee category',
            route: '/admin/fees/category/new' as const,
          }
        : {
            key: 'assessment',
            label: 'New fee assessment',
            route: '/admin/fees/assessment/new' as const,
          };

  return (
    <Screen header={bar} animationKey={tab}>
      {/* The switcher stays put whatever is under it: five module views you can
          only leave by the island are five views the thumb cannot get back from. */}
      <View style={styles.frame}>
        <View style={styles.switcher}>
          <SegmentedControl
            scrollable
            value={tab}
            onChange={setTab}
            options={[
              { label: 'Overview', value: 'overview' },
              { label: 'Assessments', value: 'assessments', count: assessments.length },
              { label: 'Categories', value: 'categories', count: categories.length },
              { label: 'Payments', value: 'payments' },
              { label: 'Reports', value: 'reports' },
            ]}
          />
        </View>
        {tab === 'payments' ? (
          <FeesPaymentsTab />
        ) : tab === 'reports' ? (
          <FeesReportsTab />
        ) : (
          <ScrollView
          contentContainerStyle={fabAction ? styles.contentTall : styles.content}
          keyboardShouldPersistTaps="handled"
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
          {error ? <ErrorBanner message={error} onRetry={load} /> : null}

          {tab === 'overview' ? (
            ledger ? (
              <>
                <View style={styles.section}>
                  <SectionHeader
                    title="Collection progress"
                    detail={
                      ledger.total_students_assessed > 0
                        ? `${ledger.students_with_balance} of ${ledger.total_students_assessed} assessed students still owe`
                        : 'Nothing assessed this year'
                    }
                  />
                  <Card style={styles.progressCard}>
                    <View style={styles.progressHead}>
                      <Text style={styles.collected}>{formatPeso(ledger.total_collected)}</Text>
                      <Text style={styles.collectedNote}>
                        collected of {formatPeso(ledger.total_assessed)} assessed
                      </Text>
                    </View>
                    <ProgressBar
                      value={Math.min(100, rate(ledger.total_collected, ledger.total_assessed))}
                      tone="navy"
                      thickness="thick"
                      detail={`${rate(ledger.total_collected, ledger.total_assessed)}%`}
                    />
                  </Card>
                  <MetricsCard
                    columns={3}
                    items={[
                      {
                        key: 'outstanding',
                        label: 'Outstanding',
                        value: formatPeso(ledger.total_outstanding),
                        tone: 'red',
                      },
                      {
                        key: 'owing',
                        label: 'Students owing',
                        value: `${ledger.students_with_balance}`,
                        tone: 'amber',
                      },
                      {
                        key: 'assessed',
                        label: 'Students assessed',
                        value: `${ledger.total_students_assessed}`,
                        tone: 'navy',
                      },
                    ]}
                  />
                </View>

                <View style={styles.section}>
                  <SectionHeader
                    title="By category"
                    detail="Bars are drawn against the largest amount assessed, so a half-filled category looks half filled."
                    count={ledger.category_breakdown.length}
                    countNoun={ledger.category_breakdown.length === 1 ? 'category' : 'categories'}
                    countTone="blue"
                  />
                  {ledger.category_breakdown.length === 0 ? (
                    <EmptyState
                      inline
                      title="Nothing assessed yet"
                      body="A category appears once an assessment is published against it."
                      icon="wallet-outline"
                    />
                  ) : (
                    <Card>
                      <BarSeries
                        data={ledger.category_breakdown.map((row) => ({
                          key: row.code,
                          label: row.category,
                          value: row.collected,
                          display: `${rate(row.collected, row.assessed)}%`,
                          detail: `${formatPeso(row.collected)} of ${formatPeso(row.assessed)}`,
                          tone: row.collected > 0 ? ('green' as Tone) : ('gray' as Tone),
                        }))}
                        scaleTo={Math.max(...ledger.category_breakdown.map((row) => row.assessed), 1)}
                        caption="Collected against assessed, per category"
                      />
                    </Card>
                  )}
                </View>

                <View style={styles.section}>
                  <SectionHeader
                    title="Recent payments"
                    count={ledger.recent_payments.length}
                    countNoun={ledger.recent_payments.length === 1 ? 'receipt' : 'receipts'}
                    countTone="green"
                    actionLabel="Ledger"
                    onAction={() => setTab('payments')}
                  />
                  {ledger.recent_payments.length === 0 ? (
                    <EmptyState
                      inline
                      title="No payments recorded"
                      body="The ledger fills as the cashier takes payments."
                      icon="receipt-outline"
                      actionLabel="Open assessments"
                      onAction={() => setTab('assessments')}
                    />
                  ) : (
                    <Card padded={false}>
                      {ledger.recent_payments.map((payment, index) => (
                        <ListRow
                          key={payment.id}
                          avatar={payment.student}
                          title={payment.student}
                          subtitle={`${payment.category} · ${formatDate(payment.payment_date)}`}
                          detail={payment.receipt_number}
                          meta={formatPeso(payment.amount)}
                          divider={index < ledger.recent_payments.length - 1}
                          chevron={false}
                        />
                      ))}
                    </Card>
                  )}
                </View>
              </>
            ) : null
          ) : tab === 'assessments' ? (
            <>
              <SearchField
                value={assessQuery}
                onChange={setAssessQuery}
                placeholder="Search category, section or student"
                testID="fees-assessment-search"
              />
              <View style={styles.filters}>
                {(
                  [
                    { value: 'all', label: 'All' },
                    { value: 'published', label: 'Published' },
                    { value: 'draft', label: 'Draft' },
                    { value: 'archived', label: 'Archived' },
                  ] as { value: AssessStatus; label: string }[]
                ).map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    count={assessCounts[option.value]}
                    selected={assessFilter === option.value}
                    tone="navy"
                    onPress={() => setAssessFilter(option.value)}
                  />
                ))}
              </View>

              <SectionHeader
                title="Assessments"
                count={visibleAssessments.length}
                countNoun={visibleAssessments.length === 1 ? 'line' : 'lines'}
                countTone="blue"
                actionLabel="New"
                onAction={() => router.push('/admin/fees/assessment/new')}
              />

              {visibleAssessments.length === 0 ? (
                <EmptyState
                  inline
                  title={assessQuery ? `Nothing matches “${assessQuery.trim()}”` : 'No assessments'}
                  body={
                    assessQuery
                      ? 'Search looks at the category, the grade level, the section and the student.'
                      : 'Assessments are raised here or in the web portal.'
                  }
                  icon={assessQuery ? 'search-outline' : 'document-text-outline'}
                  actionLabel={assessQuery ? 'Clear search' : 'New assessment'}
                  onAction={
                    assessQuery
                      ? () => setAssessQuery('')
                      : () => router.push('/admin/fees/assessment/new')
                  }
                />
              ) : (
                <Card padded={false}>
                  {visibleAssessments.map((item, index) => (
                    <ListRow
                      key={item.id}
                      icon="cash-outline"
                      tone={ASSESS_TONE[item.status]}
                      title={item.category_name}
                      subtitle={scopeOf(item)}
                      detail={`${formatPeso(item.amount)} each · due ${formatDate(item.due_date)}`}
                      trailing={
                        <View style={styles.assessTrailing}>
                          <Text
                            style={[
                              styles.assessBalance,
                              item.outstanding_balance > 0 ? styles.assessBalanceOwed : null,
                            ]}
                            numberOfLines={1}
                          >
                            {formatPeso(item.outstanding_balance)}
                          </Text>
                          <Badge label={item.status} tone={ASSESS_TONE[item.status]} glyph={false} />
                        </View>
                      }
                      divider={index < visibleAssessments.length - 1}
                      onPress={() => router.push(`/admin/fees/assessment/${item.id}`)}
                    />
                  ))}
                </Card>
              )}
            </>
          ) : (
            <>
              <SearchField
                value={catQuery}
                onChange={setCatQuery}
                placeholder="Search categories by name or code"
                testID="fees-category-search"
              />
              <View style={styles.filters}>
                {(
                  [
                    { value: 'all', label: 'All' },
                    { value: 'compulsory', label: 'Compulsory' },
                    { value: 'voluntary', label: 'Voluntary' },
                  ] as { value: CatFilter; label: string }[]
                ).map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    count={catCounts[option.value]}
                    selected={catFilter === option.value}
                    tone="navy"
                    onPress={() => setCatFilter(option.value)}
                  />
                ))}
              </View>

              <SectionHeader
                title="Fee categories"
                count={visibleCategories.length}
                countNoun={visibleCategories.length === 1 ? 'category' : 'categories'}
                countTone="violet"
                actionLabel="New"
                onAction={() => router.push('/admin/fees/category/new')}
              />

              {visibleCategories.length === 0 ? (
                <EmptyState
                  inline
                  title="No categories match"
                  body="Categories set the name, the code and whether a fee is compulsory."
                  icon={catQuery ? 'search-outline' : 'pricetags-outline'}
                  actionLabel="New category"
                  onAction={() => router.push('/admin/fees/category/new')}
                />
              ) : (
                <Card padded={false}>
                  {visibleCategories.map((item, index) => (
                    <ListRow
                      key={item.id}
                      icon="pricetags-outline"
                      tone={item.fee_type === 'compulsory' ? 'amber' : 'blue'}
                      title={item.name}
                      subtitle={`${item.code} · ${
                        item.assessment_count > 0
                          ? `${item.assessment_count} assessment${item.assessment_count === 1 ? '' : 's'}`
                          : 'not assessed yet'
                      }`}
                      detail={item.description || undefined}
                      trailing={
                        item.is_active ? (
                          <Badge
                            label={item.fee_type === 'compulsory' ? 'Required' : 'Voluntary'}
                            tone={item.fee_type === 'compulsory' ? 'amber' : 'blue'}
                            glyph={false}
                          />
                        ) : (
                          <Badge label="Retired" tone="gray" shape="dot" />
                        )
                      }
                      divider={index < visibleCategories.length - 1}
                      onPress={() => router.push(`/admin/fees/category/${item.id}`)}
                    />
                  ))}
                </Card>
              )}
            </>
          )}
          </ScrollView>
        )}
      </View>

      {fabAction ? (
        <Fab
          key={fabAction.key}
          floating
          icon="add"
          tone="brand"
          accessibilityLabel={fabAction.label}
          testID={`fees-${fabAction.key}-fab`}
          onPress={() => router.push(fabAction.route)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, minHeight: 0 },
  switcher: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  content: { padding: spacing.lg, paddingBottom: spacing.lg, gap: spacing.xl },
  /** Room for the floating action, so the last row is never under it. */
  contentTall: { padding: spacing.lg, paddingBottom: spacing.xxxl * 3, gap: spacing.xl },
  section: { gap: spacing.md },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  progressCard: { gap: spacing.md },
  progressHead: { gap: spacing.xxs },
  collected: { ...typography.figure, color: colors.text },
  collectedNote: { ...typography.caption, color: colors.textSubtle },
  assessTrailing: { alignItems: 'flex-end', gap: spacing.xs, maxWidth: 112 },
  assessBalance: { ...typography.subhead, color: colors.textMuted },
  assessBalanceOwed: { color: colors.redText },
});
