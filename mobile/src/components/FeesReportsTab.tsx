/**
 * Admin fees — collection and outstanding reports.
 *
 * Both halves are the web app's own two endpoints, filtered the same way:
 * GET /fee-reports/collection/ answers "how much of this category has the
 * school actually taken in?", and GET /fee-reports/outstanding/ answers "who
 * still owes?". The server only reports *published* assessments, so a draft
 * never shows up as income, and the school-year / category params are honoured
 * server-side rather than filtered after the fact.
 *
 * Money arrives as decimal strings; `formatPeso` is the only place they become
 * text, so a rate and a balance can never disagree.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  RefreshControl,
} from 'react-native';

import { colors, radius, spacing, typography, type Tone } from '../theme';
import { ApiError, api } from '../api/client';
import type { FeeCategory, FeeCollectionReport, FeeOutstandingReport } from '../api/types';
import { formatDate, formatPeso, formatPesoExact } from '../format';
import { EmptyState, ErrorState, LoadingState } from './StateViews';
import Badge from './ui/Badge';
import Button from './ui/Button';
import Card from './ui/Card';
import Dropdown from './ui/Dropdown';
import ProgressBar from './ui/ProgressBar';
import ScreenList from './ScreenList';
import SegmentedControl from './ui/SegmentedControl';

type Kind = 'collection' | 'outstanding';
type StatusFilter = 'all' | FeeOutstandingReport['payment_status'];

/**
 * One owed line plus the key it is listed under.
 *
 * The outstanding endpoint answers per *assessment*, and two assessments for the
 * same student, category and due date are two real bills whose rows are
 * byte-identical in the payload — there is no assessment id to key on. The
 * position in the response is fixed for as long as that response is shown, so
 * it rides along on the row instead of being recomputed per filter.
 */
type OutstandingRow = FeeOutstandingReport & { row_key: string };

const STATUS_TONE: Record<FeeOutstandingReport['payment_status'], Tone> = {
  paid: 'green',
  partial: 'amber',
  unpaid: 'red',
};

const ROW_CAP = 40;

/** `0` is the dropdown's "no filter" value; the API takes the param omitted. */
const ALL = 0;

export default function FeesReportsTab() {
  const [kind, setKind] = useState<Kind>('collection');
  const [categories, setCategories] = useState<FeeCategory[]>([]);
  const [schoolYears, setSchoolYears] = useState<{ id: number; label: string }[]>([]);
  const [year, setYear] = useState<number>(ALL);
  const [category, setCategory] = useState<number>(ALL);

  const [collection, setCollection] = useState<FeeCollectionReport[]>([]);
  const [outstanding, setOutstanding] = useState<FeeOutstandingReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [visible, setVisible] = useState(ROW_CAP);

  const loadRefs = useCallback(async () => {
    const [cats, years] = await Promise.allSettled([
      api.list<FeeCategory>('/fee-categories/'),
      api.list<{ id: number; label: string }>('/school-years/'),
    ]);
    if (cats.status === 'fulfilled') setCategories(cats.value);
    if (years.status === 'fulfilled') setSchoolYears(years.value);
  }, []);

  const loadReports = useCallback(async () => {
    const params: { school_year?: number; category?: number } = {};
    if (year !== ALL) params.school_year = year;
    if (category !== ALL) params.category = category;
    try {
      const [coll, outst] = await Promise.all([
        api.get<FeeCollectionReport[]>('/fee-reports/collection/', { params }),
        api.get<FeeOutstandingReport[]>('/fee-reports/outstanding/', { params }),
      ]);
      setCollection(coll);
      setOutstanding(outst);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the fee reports.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [year, category]);

  useEffect(() => {
    // Mount fetch — both helpers set state only after their awaits, which is
    // what the rule below is really guarding against.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRefs();
  }, [loadRefs]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReports();
  }, [loadReports]);

  const onRefresh = () => {
    setRefreshing(true);
    loadReports();
  };

  if (loading) return <LoadingState label="Building the reports…" />;
  if (error && collection.length === 0 && outstanding.length === 0) {
    return <ErrorState message={error} onRetry={onRefresh} />;
  }

  const rows: OutstandingRow[] = outstanding.map((r, i) => ({ ...r, row_key: `${r.student_id}-${i}` }));
  const filteredOutstanding = rows.filter((r) => {
    if (status !== 'all' && r.payment_status !== status) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [r.student_name, r.section, r.lrn, r.category]
      .some((v) => (v || '').toLowerCase().includes(query));
  });

  const owed = outstanding.filter((r) => r.payment_status !== 'paid');
  const owedTotal = owed.reduce((total, r) => total + Number(r.outstanding), 0);
  const owingStudents = new Set(owed.map((r) => r.student_id)).size;

  return (
    <ScrollView
      style={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.blue]} />}
      contentContainerStyle={styles.content}
    >
      <SegmentedControl<Kind>
        options={[
          { label: 'Collection', value: 'collection' },
          { label: 'Outstanding', value: 'outstanding' },
        ]}
        value={kind}
        onChange={setKind}
      />

      <View style={styles.filterRow}>
        <Dropdown<number>
          label="SCHOOL YEAR"
          options={[
            { label: 'Every year', value: ALL },
            ...schoolYears.map((y) => ({ label: y.label, value: y.id })),
          ]}
          value={year}
          onChange={(v) => setYear(v)}
          style={styles.filter}
        />
        <Dropdown<number>
          label="CATEGORY"
          options={[
            { label: 'Every category', value: ALL },
            ...categories.map((c) => ({ label: `${c.name} (${c.code})`, value: c.id })),
          ]}
          value={category}
          onChange={(v) => setCategory(v)}
          style={styles.filter}
        />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {kind === 'collection' ? (
        collection.length === 0 ? (
          <EmptyState
            inline
            title="Nothing published yet"
            body="A report only counts published assessments. Publish one, or clear the filters."
          />
        ) : (
          <View style={styles.list}>
            <ScreenList
              data={collection}
              keyExtractor={(item) => `${item.school_year}-${item.category}`}
              renderItem={(r) => {
                const rate = Number(r.collection_rate);
                return (
                  <Card style={styles.cardFull}>
                    <View style={styles.cardHead}>
                      <View style={styles.cardHeadLeft}>
                        <Text style={styles.cardTitle}>{r.category}</Text>
                        <Text style={styles.cardMeta}>{r.school_year}</Text>
                      </View>
                      <Badge
                        label={`${rate}%`}
                        tone={rate >= 80 ? 'green' : rate > 0 ? 'amber' : 'red'}
                        glyph={false}
                      />
                    </View>
                    <ProgressBar
                      value={rate}
                      tone={rate >= 80 ? 'green' : rate > 0 ? 'amber' : 'red'}
                      detail={`${formatPeso(r.total_collected)} of ${formatPeso(r.total_assessed)}`}
                    />
                    <Text style={styles.cardMeta}>
                      {formatPeso(r.total_outstanding)} still owed across {r.student_count} students
                    </Text>
                    <Text style={styles.cardMeta}>
                      {r.paid_count} paid · {r.partial_count} partial · {r.unpaid_count} unpaid
                    </Text>
                  </Card>
                );
              }}
            />
          </View>
        )
      ) : (
        <View style={styles.section}>
          <Card style={styles.cardFull}>
            <Text style={styles.cardLabel}>STILL OWED</Text>
            <Text style={[styles.metric, { color: colors.redText }]}>{formatPeso(owedTotal)}</Text>
            <Text style={styles.cardMeta}>
              {owingStudents} student{owingStudents === 1 ? '' : 's'}
              {outstanding.length > 0
                ? ` on ${outstanding.length} assessed line${outstanding.length === 1 ? '' : 's'}`
                : ' — nothing assessed in this selection'}
            </Text>
          </Card>

          <TextInput
            style={styles.searchInput}
            placeholder="Search student, section, LRN or category…"
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              setVisible(ROW_CAP);
            }}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />
          <Dropdown<StatusFilter>
            label="PAYMENT STATUS"
            options={[
              { label: 'Every line', value: 'all' },
              { label: 'Unpaid', value: 'unpaid' },
              { label: 'Partial', value: 'partial' },
              { label: 'Paid', value: 'paid' },
            ]}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setVisible(ROW_CAP);
            }}
          />

          {filteredOutstanding.length === 0 ? (
            <EmptyState
              inline
              title="No matching balances"
              body={
                outstanding.length === 0
                  ? 'Nothing is published for this selection.'
                  : 'Try another name, status or filter.'
              }
            />
          ) : (
            <View style={styles.list}>
              <ScreenList
                data={filteredOutstanding.slice(0, visible)}
                keyExtractor={(item) => item.row_key}
                renderItem={(r) => (
                  <View style={styles.row}>
                    <View style={styles.rowLeft}>
                      <Text style={styles.rowTitle}>{r.student_name}</Text>
                      <Text style={styles.rowMeta}>{r.section}</Text>
                      <Text style={styles.rowMeta}>
                        {r.category} · due {formatDate(r.due_date)}
                        {r.lrn ? ` · LRN ${r.lrn}` : ''}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {formatPesoExact(r.paid)} paid of {formatPesoExact(r.assessed)}
                      </Text>
                    </View>
                    <View style={styles.rowRight}>
                      <Text
                        style={[
                          styles.rowAmount,
                          r.payment_status === 'paid' ? styles.rowAmountPaid : styles.rowAmountOwed,
                        ]}
                      >
                        {formatPeso(r.outstanding)}
                      </Text>
                      <Badge label={r.payment_status} tone={STATUS_TONE[r.payment_status] ?? 'gray'} />
                    </View>
                  </View>
                )}
              />
              {filteredOutstanding.length > visible ? (
                <Button
                  variant="secondary"
                  block
                  onPress={() => setVisible((n) => n + ROW_CAP)}
                  accessibilityLabel={`Show more balances. ${filteredOutstanding.length - visible} hidden.`}
                >
                  Show {Math.min(ROW_CAP, filteredOutstanding.length - visible)} more of{' '}
                  {filteredOutstanding.length}
                </Button>
              ) : null}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  section: { gap: spacing.md },
  filterRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  filter: { flexGrow: 1, flexBasis: '46%' },
  errorText: { ...typography.muted, color: colors.redText },
  list: { gap: spacing.sm },
  cardFull: { alignSelf: 'stretch' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  cardHeadLeft: { flex: 1, gap: 2 },
  cardTitle: { ...typography.body, fontWeight: '700', color: colors.navy },
  cardLabel: { ...typography.label, color: colors.textSubtle },
  cardMeta: { ...typography.subtle },
  metric: { ...typography.metric },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.input,
  },
  row: {
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
  rowLeft: { flex: 1, gap: 2 },
  rowRight: { alignItems: 'flex-end', gap: spacing.xs },
  rowTitle: { ...typography.body, fontWeight: '700', color: colors.text },
  rowMeta: { ...typography.subtle },
  rowAmount: { ...typography.body, fontWeight: '700' },
  rowAmountOwed: { color: colors.redText },
  rowAmountPaid: { color: colors.greenText },
});
