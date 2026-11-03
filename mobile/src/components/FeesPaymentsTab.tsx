/**
 * Admin fees — payments ledger.
 *
 * The fee screen used to answer a tap on "Payments" with "coming soon" while
 * GET /fee-payments/ had been serving the whole ledger to the web app for
 * months. This is that list, read-only: recording a payment and voiding one
 * both need the receipt workflow the web ships, so they stay there rather than
 * half-implemented on a phone.
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
import type { FeePayment } from '../api/types';
import { formatDate, formatPeso, formatPesoExact } from '../format';
import { EmptyState, ErrorState, LoadingState } from './StateViews';
import Badge from './ui/Badge';
import Button from './ui/Button';
import Card from './ui/Card';
import Dropdown from './ui/Dropdown';
import ProgressBar from './ui/ProgressBar';
import ScreenList from './ScreenList';

type StatusFilter = 'all' | FeePayment['status'];

const STATUS_TONE: Record<FeePayment['status'], Tone> = {
  completed: 'green',
  pending: 'amber',
  voided: 'gray',
  refunded: 'blue',
};

/** Keeps a long ledger from building thousands of rows in one scroll view. */
const ROW_CAP = 40;

export default function FeesPaymentsTab() {
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [visible, setVisible] = useState(ROW_CAP);

  const load = useCallback(async () => {
    try {
      setPayments(await api.list<FeePayment>('/fee-payments/'));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the payments ledger.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Mount fetch — `load` sets state only after its await; the rule reads the
    // call rather than the schedule.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading) return <LoadingState label="Loading payments…" />;
  if (error && payments.length === 0) return <ErrorState message={error} onRetry={onRefresh} />;

  const query = search.trim().toLowerCase();
  const filtered = payments.filter((p) => {
    if (status !== 'all' && p.status !== status) return false;
    if (!query) return true;
    return [p.student_name, p.receipt_number, p.assessment_category, p.reference_number]
      .some((v) => (v || '').toLowerCase().includes(query));
  });

  const completed = payments.filter((p) => p.status === 'completed');
  const collected = completed.reduce((total, p) => total + Number(p.amount), 0);
  const pending = payments.filter((p) => p.status === 'pending');
  const pendingTotal = pending.reduce((total, p) => total + Number(p.amount), 0);

  return (
    <ScrollView
      style={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.blue]} />}
      contentContainerStyle={styles.content}
    >
      <View style={styles.grid}>
        <Card style={styles.cardGrow}>
          <Text style={styles.cardLabel}>COLLECTED</Text>
          <Text style={styles.cardValue}>{formatPeso(collected)}</Text>
          <ProgressBar
            value={payments.length === 0 ? 0 : (completed.length / payments.length) * 100}
            tone="green"
            detail={`${completed.length} of ${payments.length} receipts completed`}
          />
        </Card>
        <Card style={styles.cardGrow}>
          <Text style={styles.cardLabel}>AWAITING CLEARING</Text>
          <Text style={[styles.cardValue, { color: colors.amberText }]}>{formatPeso(pendingTotal)}</Text>
          <ProgressBar
            value={payments.length === 0 ? 0 : (pending.length / payments.length) * 100}
            tone="amber"
            detail={`${pending.length} pending`}
          />
        </Card>
      </View>

      <View style={styles.section}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search student, receipt or reference…"
          value={search}
          onChangeText={(v) => {
            setSearch(v);
            setVisible(ROW_CAP);
          }}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
        />
        <Dropdown<StatusFilter>
          label="STATUS"
          options={[
            { label: 'Every status', value: 'all' },
            { label: 'Completed', value: 'completed' },
            { label: 'Pending', value: 'pending' },
            { label: 'Voided', value: 'voided' },
            { label: 'Refunded', value: 'refunded' },
          ]}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setVisible(ROW_CAP);
          }}
        />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {filtered.length === 0 ? (
        <EmptyState
          inline
          title="No payments match"
          body={payments.length === 0 ? 'No payment has been recorded yet.' : 'Try a different name or status.'}
        />
      ) : (
        <View style={styles.list}>
          <ScreenList
            data={filtered.slice(0, visible)}
            keyExtractor={(item) => String(item.id)}
            renderItem={(p) => (
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <Text style={styles.rowTitle}>{p.student_name}</Text>
                  <Text style={styles.rowMeta}>
                    {p.assessment_category} · {formatDate(p.payment_date)} · {p.receipt_number}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {p.payment_method.replace(/_/g, ' ')}
                    {p.recorded_by_name ? ` · recorded by ${p.recorded_by_name}` : ''}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={[styles.rowAmount, p.status === 'voided' && styles.rowAmountVoided]}>
                    {formatPesoExact(p.amount)}
                  </Text>
                  <Badge label={p.status} tone={STATUS_TONE[p.status] ?? 'gray'} />
                </View>
              </View>
            )}
          />
          {filtered.length > visible ? (
            <Button
              variant="secondary"
              block
              onPress={() => setVisible((n) => n + ROW_CAP)}
              accessibilityLabel={`Show more payments. ${filtered.length - visible} hidden.`}
            >
              Show {Math.min(ROW_CAP, filtered.length - visible)} more of {filtered.length}
            </Button>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  section: { gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cardGrow: { flexGrow: 1, flexBasis: '46%', gap: spacing.xs },
  cardLabel: { ...typography.label, color: colors.textSubtle },
  cardValue: { ...typography.metric, color: colors.navy },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.input,
  },
  errorText: { ...typography.muted, color: colors.redText },
  list: { gap: spacing.sm },
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
  rowAmount: { ...typography.body, fontWeight: '700', color: colors.greenText },
  rowAmountVoided: { color: colors.textMuted, textDecorationLine: 'line-through' },
});
