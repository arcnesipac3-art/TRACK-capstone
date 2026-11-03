/**
 * Admin fee management — the bursar's five views over one set of endpoints.
 *
 * Dashboard, categories, assessments, payments and reports. The two editors
 * live on their own routes (`/admin/fees/category/<id>`,
 * `/admin/fees/assessment/<id>`) and the two heaviest views are components,
 * because a phone screen that inlines all five would be 900 lines of tabs.
 * Everything here is the same data the web fees page reads.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, typography } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import { formatDate, formatPeso } from '../../../format';
import type { FeeCategory, FeeAssessment, FeeDashboardSummary } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import FeesPaymentsTab from '../../../components/FeesPaymentsTab';
import FeesReportsTab from '../../../components/FeesReportsTab';
import HeaderActions from '../../../components/ui/HeaderActions';
import AppHeader from '../../../components/ui/AppHeader';
import StatTile from '../../../components/ui/StatTile';
import Badge from '../../../components/ui/Badge';
import SegmentedControl from '../../../components/ui/SegmentedControl';

type Tab = 'dashboard' | 'categories' | 'assessments' | 'payments' | 'reports';

export default function AdminFeesScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Categories
  const [categories, setCategories] = useState<FeeCategory[]>([]);
  const [catSearch, setCatSearch] = useState('');
  const [catFilter, setCatFilter] = useState<'all' | 'compulsory' | 'voluntary'>('all');

  // Assessments
  const [assessments, setAssessments] = useState<FeeAssessment[]>([]);
  const [assessSearch, setAssessSearch] = useState('');
  const [assessStatusFilter, setAssessStatusFilter] = useState<'all' | 'draft' | 'published' | 'archived'>('all');

  // Dashboard
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

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading) return <LoadingState label="Loading fee management…" />;
  if (error && !categories.length) {
    return (
      <ErrorState message={error} onRetry={onRefresh} />
    );
  }

  const filteredCategories = categories.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(catSearch.toLowerCase()) ||
      c.code.toLowerCase().includes(catSearch.toLowerCase());
    const matchesFilter = catFilter === 'all' || c.fee_type === catFilter;
    return matchesSearch && matchesFilter;
  });

  const filteredAssessments = assessments.filter(a => {
    const matchesSearch = a.category_name.toLowerCase().includes(assessSearch.toLowerCase()) ||
      a.category_code.toLowerCase().includes(assessSearch.toLowerCase()) ||
      (a.student_name?.toLowerCase().includes(assessSearch.toLowerCase()) ?? false);
    const matchesFilter = assessStatusFilter === 'all' || a.status === assessStatusFilter;
    return matchesSearch && matchesFilter;
  });

  const renderCategoriesTab = () => (
    <ScrollView
      style={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.blue]} />}
      contentContainerStyle={styles.content}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fee Categories</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search categories…"
          value={catSearch}
          onChangeText={setCatSearch}
          placeholderTextColor={colors.textMuted}
        />
        <SegmentedControl<"all" | "compulsory" | "voluntary">
          options={['All', 'Compulsory', 'Voluntary'].map((label, i) => ({
            label,
            value: i === 0 ? 'all' : i === 1 ? 'compulsory' : 'voluntary',
          }))}
          value={catFilter}
          onChange={setCatFilter}
        />
      </View>

      {filteredCategories.length === 0 ? (
        <EmptyState inline title="No categories found" body="Create a fee category to get started." />
      ) : (
        <View style={styles.list}>
          {filteredCategories.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={styles.listItem}
              onPress={() => router.push(`/admin/fees/category/${cat.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.listItemLeft}>
                <Text style={styles.listItemTitle}>{cat.name}</Text>
                <Text style={styles.listItemSubtitle}>{cat.code} · {cat.fee_type}</Text>
              </View>
              <View style={styles.listItemRight}>
                <Badge
                  label={cat.fee_type === 'compulsory' ? 'Required' : 'Voluntary'}
                  tone={cat.fee_type === 'compulsory' ? 'amber' : 'blue'}
                />
                <Text style={styles.listItemCount}>{cat.assessment_count} assessments</Text>
                <Ionicons name="chevron-forward-outline" size={20} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.blue }]}
          onPress={() => router.push('/admin/fees/category/new')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="New fee category"
        >
          <Ionicons name="add" size={24} color={colors.surface} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderAssessmentsTab = () => (
    <ScrollView
      style={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.blue]} />}
      contentContainerStyle={styles.content}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fee Assessments</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search assessments…"
          value={assessSearch}
          onChangeText={setAssessSearch}
          placeholderTextColor={colors.textMuted}
        />
        <SegmentedControl<"all" | "draft" | "published" | "archived">
          options={[
            { label: 'All', value: 'all' },
            { label: 'Draft', value: 'draft' },
            { label: 'Published', value: 'published' },
            { label: 'Archived', value: 'archived' },
          ]}
          value={assessStatusFilter}
          onChange={setAssessStatusFilter}
        />
      </View>

      {filteredAssessments.length === 0 ? (
        <EmptyState inline title="No assessments found" body="Create an assessment to assign fees." />
      ) : (
        <View style={styles.list}>
          {filteredAssessments.map(a => (
            <TouchableOpacity
              key={a.id}
              style={styles.listItem}
              onPress={() => router.push(`/admin/fees/assessment/${a.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.listItemLeft}>
                <Text style={styles.listItemTitle}>{a.category_name}</Text>
                <Text style={styles.listItemSubtitle}>
                  {formatPeso(a.amount)} · Due {formatDate(a.due_date)}
                  {a.grade_level_name && ` · ${a.grade_level_name}`}
                  {a.section_name && ` · ${a.section_name}`}
                  {a.student_name && ` · ${a.student_name}`}
                </Text>
              </View>
              <View style={styles.listItemRight}>
                <Badge
                  label={a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                  tone={
                    a.status === 'published' ? 'green' :
                    a.status === 'archived' ? 'gray' : 'amber'
                  }
                />
                <Text style={styles.listItemCount}>
                  Collected: {formatPeso(a.total_collected)} of {formatPeso(a.total_assessed)}
                </Text>
                <Ionicons name="chevron-forward-outline" size={20} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.blue }]}
          onPress={() => router.push('/admin/fees/assessment/new')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="New fee assessment"
        >
          <Ionicons name="add" size={24} color={colors.surface} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderDashboardTab = () => (
    <ScrollView
      style={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.blue]} />}
      contentContainerStyle={styles.content}
    >
      {dashboard && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Collection Summary</Text>
            <View style={styles.grid}>
              <StatTile label="Total assessed" value={formatPeso(dashboard.total_assessed)} tone="navy" />
              <StatTile label="Total collected" value={formatPeso(dashboard.total_collected)} tone="green" />
              <StatTile label="Outstanding" value={formatPeso(dashboard.total_outstanding)} tone="amber" />
              <StatTile label="Students w/ balance" value={dashboard.students_with_balance} tone="red" />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>By Category</Text>
            <View style={styles.list}>
              {dashboard.category_breakdown.map(cat => (
                <View key={cat.category} style={styles.listItem}>
                  <View style={styles.listItemLeft}>
                    <Text style={styles.listItemTitle}>{cat.category}</Text>
                    <Text style={styles.listItemSubtitle}>
                      {formatPeso(cat.collected)} of {formatPeso(cat.assessed)} collected
                    </Text>
                  </View>
                  <View style={styles.listItemRight}>
                    <Text style={styles.listItemCount}>
                      {cat.assessed > 0 ? Math.round((cat.collected / cat.assessed) * 100) : 0}%
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Payments</Text>
            {dashboard.recent_payments.length === 0 ? (
              <EmptyState inline title="No payments yet" body="Payments will appear here." />
            ) : (
              <View style={styles.list}>
                {dashboard.recent_payments.map(p => (
                  <View key={p.id} style={styles.listItem}>
                    <View style={styles.listItemLeft}>
                      <Text style={styles.listItemTitle}>{p.student}</Text>
                      <Text style={styles.listItemSubtitle}>{p.category} · {formatDate(p.payment_date)}</Text>
                    </View>
                    <View style={styles.listItemRight}>
                      <Text style={styles.listItemAmount}>{formatPeso(p.amount)}</Text>
                      <Text style={styles.listItemReceipt}>{p.receipt_number}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );

  const renderPaymentsTab = () => <FeesPaymentsTab />;

  const renderReportsTab = () => <FeesReportsTab />;

  return (
    <View style={styles.screen}>
      <AppHeader
        hero
        title="Fee Management"
        subtitle={dashboard
          ? `${formatPeso(dashboard.total_outstanding)} outstanding across ${dashboard.total_students_assessed} students`
          : undefined}
        right={<HeaderActions />}
      />
      <SegmentedControl
        options={[
          { label: 'Dashboard', value: 'dashboard' },
          { label: 'Categories', value: 'categories' },
          { label: 'Assessments', value: 'assessments' },
          { label: 'Payments', value: 'payments' },
          { label: 'Reports', value: 'reports' },
        ]}
        value={activeTab}
        onChange={setActiveTab}
        style={styles.tabs}
      />
      {activeTab === 'dashboard' && renderDashboardTab()}
      {activeTab === 'categories' && renderCategoriesTab()}
      {activeTab === 'assessments' && renderAssessmentsTab()}
      {activeTab === 'payments' && renderPaymentsTab()}
      {activeTab === 'reports' && renderReportsTab()}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl },
  section: { gap: spacing.md },
  sectionTitle: { ...typography.heading, color: colors.navy },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.body,
  },
  list: { gap: spacing.sm },
  listItem: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  listItemLeft: { flex: 1 },
  listItemRight: { alignItems: 'flex-end', gap: spacing.xs },
  listItemTitle: { ...typography.body, fontWeight: '700', color: colors.text },
  listItemSubtitle: { ...typography.subtle, marginTop: 2 },
  listItemCount: { ...typography.subtle, color: colors.textMuted },
  listItemAmount: { ...typography.body, fontWeight: '700', color: colors.greenText },
  listItemReceipt: { ...typography.subtle, color: colors.textMuted },
  fab: {
    alignSelf: 'flex-end',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  tabs: { marginHorizontal: spacing.xl, marginTop: -spacing.lg, marginBottom: spacing.md },
});