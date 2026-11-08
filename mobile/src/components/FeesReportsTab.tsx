/**
 * Admin fees — collection and outstanding reports.
 *
 * Both halves are the web app's own two endpoints, filtered the same way:
 * GET /fee-reports/collection/ answers "how much of this category has the school
 * actually taken in?", and GET /fee-reports/outstanding/ answers "who still
 * owes?". The server only reports *published* assessments, so a draft never shows
 * up as income, and the school-year / category params are honoured server-side
 * rather than filtered after the fact.
 *
 * Money arrives as decimal strings; `formatPeso` is the only place they become
 * text, so a rate and a balance can never disagree.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography, type Tone } from '../theme';
import { ApiError, api } from '../api/client';
import type { FeeCategory, FeeCollectionReport, FeeOutstandingReport } from '../api/types';
import { formatDate, formatPeso, formatPesoExact } from '../format';
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from './StateViews';
import Badge from './ui/Badge';
import Button from './ui/Button';
import Card from './ui/Card';
import Chip from './ui/Chip';
import Dropdown from './ui/Dropdown';
import ListRow from './ui/ListRow';
import MetricsCard from './ui/MetricsCard';
import ProgressBar from './ui/ProgressBar';
import SearchField from './ui/SearchField';
import SectionHeader from './ui/SectionHeader';
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

/** A collection rate is good, worth chasing, or gone. Three bands, no more. */
function rateTone(rate: number): 'green' | 'amber' | 'red' {
  if (rate >= 80) return 'green';
  if (rate > 0) return 'amber';
  return 'red';
}

const ROW_CAP = 40;

/**
 * The section as a row label: "Grade 7 — Sampaguita (2026-2027)" is the school's full
 * name for it, and the year is already what the whole report is scoped by.
 */
function sectionLabel(name?: string | null) {
  const trimmed = (name || '').replace(/\s*\(\d{4}-\d{4}\)\s*$/, '').trim();
  return trimmed || 'No section';
}

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
    (async () => {
      await loadRefs();
    })();
  }, [loadRefs]);

  useEffect(() => {
    (async () => {
      await loadReports();
    })();
  }, [loadReports]);

  const owed = useMemo(() => {
    const lines = outstanding.filter((row) => row.payment_status !== 'paid');
    return {
      total: lines.reduce((sum, row) => sum + Number(row.outstanding), 0),
      students: new Set(lines.map((row) => row.student_id)).size,
      lines: lines.length,
    };
  }, [outstanding]);

  const filteredOutstanding = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows: OutstandingRow[] = outstanding.map((row, index) => ({
      ...row,
      row_key: `${row.student_id}-${index}`,
    }));
    return rows.filter((row) => {
      if (status !== 'all' && row.payment_status !== status) return false;
      if (!query) return true;
      return [row.student_name, row.section, row.lrn, row.category].some((value) =>
        (value || '').toLowerCase().includes(query)
      );
    });
  }, [outstanding, status, search]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { all: outstanding.length, paid: 0, partial: 0, unpaid: 0 };
    outstanding.forEach((row) => {
      counts[row.payment_status] += 1;
    });
    return counts;
  }, [outstanding]);

  // Unpaid lines plus settled lines is the whole assessment, so the three figures on the
  // card and the line under them cannot tell two different stories.
  const assessedLines = owed.lines + statusCounts.paid;
  const footnote =
    outstanding.length === 0
      ? 'Nothing assessed in this selection'
      : owed.students === 0
        ? `${assessedLines} assessed line${assessedLines === 1 ? '' : 's'} in this selection — all settled`
        : `${owed.students} student${owed.students === 1 ? '' : 's'} owe across ${owed.lines} of ${assessedLines} assessed lines`;

  if (loading) {
    return (
      <View style={styles.wrap}>
        <LoadingState label="Building the reports…" rows={4} />
      </View>
    );
  }

  if (error && collection.length === 0 && outstanding.length === 0) {
    return (
      <View style={styles.wrap}>
        <ErrorState
          message={error}
          onRetry={() => {
            setLoading(true);
            loadReports();
          }}
        />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadReports();
          }}
          colors={[colors.blue]}
          tintColor={colors.blue}
        />
      }
    >
      <SegmentedControl<Kind>
        options={[
          { label: 'Collection', value: 'collection', count: collection.length },
          { label: 'Outstanding', value: 'outstanding', count: outstanding.length },
        ]}
        value={kind}
        onChange={setKind}
      />

      <View style={styles.filterRow}>
        <Dropdown<number>
          label="SCHOOL YEAR"
          options={[
            { label: 'Every year', value: ALL },
            ...schoolYears.map((item) => ({ label: item.label, value: item.id })),
          ]}
          value={year}
          onChange={setYear}
          style={styles.filter}
        />
        <Dropdown<number>
          label="CATEGORY"
          options={[
            { label: 'Every category', value: ALL },
            ...categories.map((item) => ({ label: `${item.name} (${item.code})`, value: item.id })),
          ]}
          value={category}
          onChange={setCategory}
          style={styles.filter}
        />
      </View>

      {error ? <ErrorBanner message={error} onRetry={loadReports} /> : null}

      {kind === 'collection' ? (
        collection.length === 0 ? (
          <EmptyState
            inline
            title="Nothing published yet"
            body="A report only counts published assessments. Publish one, or clear the filters."
            icon="stats-chart-outline"
            actionLabel={year !== ALL || category !== ALL ? 'Clear filters' : undefined}
            onAction={
              year !== ALL || category !== ALL
                ? () => {
                    setYear(ALL);
                    setCategory(ALL);
                  }
                : undefined
            }
          />
        ) : (
          <View style={styles.group}>
            <SectionHeader
              title="Collection by category"
              detail="Only published assessments are counted."
              count={collection.length}
              countNoun={collection.length === 1 ? 'report' : 'reports'}
              countTone="blue"
            />
            {collection.map((report) => {
              const rate = Number(report.collection_rate);
              return (
                <Card key={`${report.school_year}-${report.category}`} style={styles.reportCard}>
                  <View style={styles.reportHead}>
                    <View style={styles.reportTitles}>
                      <Text style={styles.reportTitle}>{report.category}</Text>
                      <Text style={styles.reportMeta}>{report.school_year}</Text>
                    </View>
                    <Badge
                      label={`${rate}%`}
                      tone={rateTone(rate)}
                      glyph={false}
                      style={styles.rateBadge}
                    />
                  </View>
                  <ProgressBar
                    value={rate}
                    tone={rateTone(rate)}
                    detail={`${formatPeso(report.total_collected)} of ${formatPeso(report.total_assessed)}`}
                  />
                  <MetricsCard
                    columns={3}
                    style={styles.innerMetrics}
                    items={[
                      {
                        key: 'owed',
                        label: 'Still owed',
                        value: formatPeso(report.total_outstanding),
                        tone: 'red',
                      },
                      {
                        key: 'students',
                        label: 'Students',
                        value: `${report.student_count}`,
                        tone: 'navy',
                      },
                      {
                        key: 'paid',
                        label: 'Settled',
                        value: `${report.paid_count}`,
                        detail: `${report.partial_count} partial · ${report.unpaid_count} unpaid`,
                        tone: 'green',
                      },
                    ]}
                  />
                </Card>
              );
            })}
          </View>
        )
      ) : (
        <View style={styles.group}>
          <MetricsCard
            lead
            footnote={footnote}
            items={[
              { key: 'owed', label: 'Still owed', value: formatPeso(owed.total), tone: 'red' },
              {
                key: 'lines',
                label: 'Unpaid lines',
                value: `${owed.lines}`,
                tone: 'navy',
              },
              { key: 'settled', label: 'Settled lines', value: `${statusCounts.paid}`, tone: 'green' },
            ]}
          />

          <SearchField
            value={search}
            onChange={(next) => {
              setSearch(next);
              setVisible(ROW_CAP);
            }}
            placeholder="Search student, section, LRN or category"
            testID="fees-report-search"
          />

          <View style={styles.filters}>
            {(
              [
                { value: 'all', label: 'Every line' },
                { value: 'unpaid', label: 'Unpaid' },
                { value: 'partial', label: 'Partial' },
                { value: 'paid', label: 'Paid' },
              ] as { value: StatusFilter; label: string }[]
            ).map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                count={statusCounts[option.value]}
                selected={status === option.value}
                tone="navy"
                onPress={() => {
                  setStatus(option.value);
                  setVisible(ROW_CAP);
                }}
              />
            ))}
          </View>

          <SectionHeader
            title="Student balances"
            count={filteredOutstanding.length}
            countNoun={filteredOutstanding.length === 1 ? 'line' : 'lines'}
            countTone={owed.total > 0 ? 'red' : 'green'}
          />

          {filteredOutstanding.length === 0 ? (
            <EmptyState
              inline
              title={search ? `Nothing matches “${search.trim()}”` : 'No matching balances'}
              body={
                outstanding.length === 0
                  ? 'Nothing is published for this selection.'
                  : 'Search covers the student, the section, the LRN and the category.'
              }
              icon={search ? 'search-outline' : 'wallet-outline'}
              actionLabel={search ? 'Clear search' : undefined}
              onAction={search ? () => setSearch('') : undefined}
            />
          ) : (
            <View style={styles.group}>
              <Card padded={false}>
                {filteredOutstanding.slice(0, visible).map((row, index) => (
                  <ListRow
                    key={row.row_key}
                    avatar={row.student_name}
                    title={row.student_name}
                    subtitle={`${sectionLabel(row.section)} · ${row.category}`}
                    detail={`Due ${formatDate(row.due_date)} · ${formatPesoExact(row.paid)} paid of ${formatPesoExact(
                      row.assessed
                    )}${row.lrn ? ` · LRN ${row.lrn}` : ''}`}
                    trailing={
                      <View style={styles.trailing}>
                        <Text
                          style={[
                            styles.balance,
                            row.payment_status === 'paid' ? styles.balanceSettled : null,
                          ]}
                          numberOfLines={1}
                        >
                          {formatPeso(row.outstanding)}
                        </Text>
                        <Badge
                          label={row.payment_status}
                          tone={STATUS_TONE[row.payment_status] ?? 'gray'}
                          glyph={false}
                        />
                      </View>
                    }
                    chevron={false}
                    divider={index < Math.min(filteredOutstanding.length, visible) - 1}
                  />
                ))}
              </Card>
              {filteredOutstanding.length > visible ? (
                <Button
                  variant="secondary"
                  block
                  onPress={() => setVisible((count) => count + ROW_CAP)}
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
  wrap: { flex: 1, padding: spacing.lg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  group: { gap: spacing.md },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  filter: { flexGrow: 1, flexBasis: '46%' },
  reportCard: { gap: spacing.md },
  reportHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  reportTitles: { flex: 1, gap: 2 },
  reportTitle: { ...typography.subhead, color: colors.navy },
  reportMeta: { ...typography.subtle },
  rateBadge: { flexShrink: 0 },
  /** A metrics grid inside a card already has its own rules; drop the outer frame. */
  innerMetrics: { borderWidth: 0, paddingVertical: 0, paddingHorizontal: 0 },
  trailing: { alignItems: 'flex-end', gap: spacing.xs, maxWidth: 116 },
  balance: { ...typography.subhead, color: colors.redText },
  balanceSettled: { color: colors.greenText },
});
