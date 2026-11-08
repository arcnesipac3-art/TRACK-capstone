/**
 * Admin fees — payments ledger.
 *
 * The fee screen used to answer a tap on "Payments" with "coming soon" while
 * GET /fee-payments/ had been serving the whole ledger to the web app for months.
 * This is that list, read-only: recording a payment and voiding one both need the
 * receipt workflow the web ships, so they stay there rather than being
 * half-implemented on a phone.
 *
 * What is on the page is the server's own money: `collected` sums completed
 * receipts, `awaiting` sums pending ones, and the row cap keeps a long ledger from
 * building thousands of views inside one scroll.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography, type Tone } from '../theme';
import { ApiError, api } from '../api/client';
import type { FeePayment } from '../api/types';
import { countNoun, formatDate, formatPeso, formatPesoExact } from '../format';
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from './StateViews';
import Badge from './ui/Badge';
import Button from './ui/Button';
import Card from './ui/Card';
import Chip from './ui/Chip';
import ListRow from './ui/ListRow';
import MetricsCard from './ui/MetricsCard';
import SearchField from './ui/SearchField';
import SectionHeader from './ui/SectionHeader';

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
    (async () => {
      await load();
    })();
  }, [load]);

  const totals = useMemo(() => {
    let collected = 0;
    let pending = 0;
    let completedCount = 0;
    let pendingCount = 0;
    payments.forEach((payment) => {
      const amount = Number(payment.amount);
      if (payment.status === 'completed') {
        collected += amount;
        completedCount += 1;
      } else if (payment.status === 'pending') {
        pending += amount;
        pendingCount += 1;
      }
    });
    return { collected, pending, completedCount, pendingCount };
  }, [payments]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: payments.length,
      completed: 0,
      pending: 0,
      voided: 0,
      refunded: 0,
    };
    payments.forEach((payment) => {
      counts[payment.status] += 1;
    });
    return counts;
  }, [payments]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return payments.filter((payment) => {
      if (status !== 'all' && payment.status !== status) return false;
      if (!query) return true;
      return [
        payment.student_name,
        payment.receipt_number,
        payment.assessment_category,
        payment.reference_number,
      ].some((value) => (value || '').toLowerCase().includes(query));
    });
  }, [payments, status, search]);

  if (loading) {
    return (
      <View style={styles.wrap}>
        <LoadingState label="Loading payments…" rows={5} />
      </View>
    );
  }

  if (error && payments.length === 0) {
    return (
      <View style={styles.wrap}>
        <ErrorState
          message={error}
          onRetry={() => {
            setLoading(true);
            load();
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
            load();
          }}
          colors={[colors.blue]}
          tintColor={colors.blue}
        />
      }
    >
      <MetricsCard
        lead
        footnote={`${countNoun(totals.completedCount, 'completed receipt')} of ${
          payments.length
        } on the ledger`}
        items={[
          { key: 'collected', label: 'Collected', value: formatPeso(totals.collected), tone: 'green' },
          { key: 'awaiting', label: 'Awaiting clearing', value: formatPeso(totals.pending), tone: 'amber' },
          { key: 'receipts', label: 'Receipts', value: `${payments.length}`, tone: 'navy' },
        ]}
      />

      <SearchField
        value={search}
        onChange={(next) => {
          setSearch(next);
          setVisible(ROW_CAP);
        }}
        placeholder="Search student, receipt or reference"
        testID="fees-payment-search"
      />

      <View style={styles.filters}>
        {(
          [
            { value: 'all', label: 'All' },
            { value: 'completed', label: 'Completed' },
            { value: 'pending', label: 'Pending' },
            { value: 'voided', label: 'Voided' },
            { value: 'refunded', label: 'Refunded' },
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

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      <SectionHeader
        title="Ledger"
        count={filtered.length}
        countNoun={filtered.length === 1 ? 'receipt' : 'receipts'}
        countTone="blue"
      />

      {filtered.length === 0 ? (
        <EmptyState
          inline
          title={search ? `Nothing matches “${search.trim()}”` : 'No payments recorded'}
          body={
            payments.length === 0
              ? 'A receipt appears here the moment the cashier records one.'
              : 'Search covers the student, the receipt number, the category and the reference.'
          }
          icon={search ? 'search-outline' : 'receipt-outline'}
          actionLabel={search ? 'Clear search' : undefined}
          onAction={search ? () => setSearch('') : undefined}
        />
      ) : (
        <View style={styles.group}>
          <Card padded={false}>
            {filtered.slice(0, visible).map((payment, index) => (
              <ListRow
                key={payment.id}
                avatar={payment.student_name}
                title={payment.student_name}
                subtitle={`${payment.assessment_category} · ${formatDate(payment.payment_date)}`}
                detail={`${payment.payment_method.replace(/_/g, ' ')} · ${payment.receipt_number}`}
                trailing={
                  <View style={styles.trailing}>
                    <Text
                      style={[
                        styles.amount,
                        payment.status === 'voided' ? styles.amountVoided : null,
                      ]}
                      numberOfLines={1}
                    >
                      {formatPesoExact(payment.amount)}
                    </Text>
                    <Badge label={payment.status} tone={STATUS_TONE[payment.status] ?? 'gray'} glyph={false} />
                  </View>
                }
                chevron={false}
                divider={index < Math.min(filtered.length, visible) - 1}
              />
            ))}
          </Card>
          {filtered.length > visible ? (
            <Button
              variant="secondary"
              block
              onPress={() => setVisible((count) => count + ROW_CAP)}
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
  wrap: { flex: 1, padding: spacing.lg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  group: { gap: spacing.md },
  trailing: { alignItems: 'flex-end', gap: spacing.xs, maxWidth: 116 },
  amount: { ...typography.subhead, color: colors.greenText },
  amountVoided: { color: colors.textMuted, textDecorationLine: 'line-through' },
});
