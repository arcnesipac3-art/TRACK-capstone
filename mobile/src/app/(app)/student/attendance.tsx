/**
 * Student attendance — read-only history.
 *
 * Subject/section/date live under `session_detail` in the API response, not
 * at the record's top level (verified against the live backend).
 */
import { Fragment, useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView } from 'react-native';

import { colors, spacing, radius, typography, type Tone } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import type { AttendanceRecord } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import AppHeader from '../../../components/ui/AppHeader';
import Badge from '../../../components/ui/Badge';

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** `YYYY-MM` grouping key in local time — matches the dates formatDate shows. */
function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split('-');
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

function statusMeta(status: AttendanceRecord['status']): { label: string; tone: Tone } {
  switch (status) {
    case 'present': return { label: 'Present', tone: 'green' };
    case 'absent': return { label: 'Absent', tone: 'red' };
    case 'late': return { label: 'Late', tone: 'amber' };
    default: return { label: 'Excused', tone: 'gray' };
  }
}

export default function StudentAttendanceScreen() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.list<AttendanceRecord>('/attendance/records/');
      setRecords(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load attendance.');
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

  if (loading) return <LoadingState label="Loading attendance…" />;
  if (error && records.length === 0) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  const rows = [...records].sort(
    (a, b) =>
      new Date(b.session_detail?.date ?? b.recorded_at).getTime() -
      new Date(a.session_detail?.date ?? a.recorded_at).getTime()
  );

  // Group by the record's YYYY-MM (rows are newest-first, so each month forms
  // one contiguous run; records keep their existing order within a month).
  const groups: { key: string; label: string; items: AttendanceRecord[] }[] = [];
  for (const record of rows) {
    const key = monthKey(record.session_detail?.date ?? record.recorded_at);
    const current = groups[groups.length - 1];
    if (current && current.key === key) {
      current.items.push(record);
    } else {
      groups.push({ key, label: monthLabel(key), items: [record] });
    }
  }

  return (
    <View style={styles.screen}>
      <AppHeader title="Attendance" subtitle="Your school-day records." />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.navy700]} />}
        contentContainerStyle={styles.content}
      >
        {error && <Text style={styles.errorText}>{error}</Text>}
        {rows.length === 0 ? (
          <EmptyState
            inline
            title="No attendance records"
            body="Your attendance will appear here after each class."
          />
        ) : (
          groups.map((group) => (
            <View key={group.key} style={styles.monthGroup}>
              <Text style={styles.monthCaption}>{group.label}</Text>
              {group.items.map((item, i) => (
                <Fragment key={String(item.id)}>
                  {i > 0 && <View style={styles.separator} />}
                  <RecordRow item={item} />
                </Fragment>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function RecordRow({ item }: { item: AttendanceRecord }) {
  const meta = statusMeta(item.status);
  const detail = item.session_detail;

  return (
    <View style={styles.card}>
      <View style={styles.rowTop}>
        <View style={styles.grow}>
          <Text style={styles.subject}>{detail?.subject_name || 'Subject'}</Text>
          <Text style={styles.title}>{detail?.section_name || 'Section'}</Text>
        </View>
        <Badge label={meta.label} tone={meta.tone} />
      </View>
      <View style={styles.details}>
        <Text style={styles.detail}>{formatDate(detail?.date ?? item.recorded_at)}</Text>
        {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  errorText: { ...typography.muted, color: colors.red700 },
  monthGroup: { gap: spacing.sm },
  monthCaption: { ...typography.label, color: colors.navy700 },
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
  subject: { ...typography.label, color: colors.navy700 },
  title: { ...typography.heading, color: colors.text, marginTop: 2 },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  detail: { ...typography.subtle },
  notes: {
    fontSize: 15,
    color: colors.textMuted,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  separator: { height: 1 },
});
