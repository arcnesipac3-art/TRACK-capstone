/**
 * Parent attendance — attendance history for one linked child.
 *
 * Uses `?student=<StudentProfile pk>` (the parameter the backend validates
 * against the parent's linked children) and reads subject/section/date from
 * `session_detail`, where the API actually puts them.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import ScreenList from '../../../components/ScreenList';
import { useLocalSearchParams } from 'expo-router';
import { Picker } from '@react-native-picker/picker';

import { colors, spacing, radius, typography, type Tone } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import type { AttendanceRecord, StudentProfile } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import AppHeader from '../../../components/ui/AppHeader';
import Badge from '../../../components/ui/Badge';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusMeta(status: AttendanceRecord['status']): { label: string; tone: Tone } {
  switch (status) {
    case 'present': return { label: 'Present', tone: 'green' };
    case 'absent': return { label: 'Absent', tone: 'red' };
    case 'late': return { label: 'Late', tone: 'amber' };
    default: return { label: 'Excused', tone: 'gray' };
  }
}

export default function ParentAttendanceScreen() {
  const params = useLocalSearchParams<{ child?: string }>();
  const [children, setChildren] = useState<StudentProfile[]>([]);
  const [kidsLoaded, setKidsLoaded] = useState(false);
  const [kidsError, setKidsError] = useState<string | null>(null);
  const [kidsKey, setKidsKey] = useState(0);
  const [selectedChild, setSelectedChild] = useState<string | null>(params.child ?? null);
  const [loadedChild, setLoadedChild] = useState<string | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Children list (once per kidsKey — retry re-runs it).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const kids = await api.list<StudentProfile>('/students/');
        if (!active) return;
        setChildren(kids);
        setKidsError(null);
        setSelectedChild((current) => {
          if (current) return current;
          if (params.child) return params.child;
          return kids.length > 0 ? String(kids[0].id) : null;
        });
      } catch (err) {
        if (active) setKidsError(err instanceof ApiError ? err.message : 'Could not load your children.');
      } finally {
        if (active) setKidsLoaded(true);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kidsKey]);

  // Attendance records for the selected child (`?student=` takes a
  // StudentProfile pk — the id space /students/ returns).
  useEffect(() => {
    if (!selectedChild) return;
    let active = true;
    (async () => {
      try {
        const data = await api.list<AttendanceRecord>('/attendance/records/', {
          params: { student: selectedChild },
        });
        if (!active) return;
        setRecords(data);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : 'Could not load attendance.');
        setRecords([]);
      } finally {
        if (active) {
          setLoadedChild(selectedChild);
          setRefreshing(false);
        }
      }
    })();
    return () => { active = false; };
  }, [selectedChild, reloadKey]);

  const onRefresh = () => {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
  };

  const retryKids = () => {
    setKidsLoaded(false);
    setKidsError(null);
    setKidsKey((k) => k + 1);
  };

  const retryData = () => {
    setLoadedChild(null);
    setError(null);
    setReloadKey((k) => k + 1);
  };

  const rows = useMemo(
    () =>
      loadedChild !== selectedChild
        ? []
        : [...records].sort(
            (a, b) =>
              new Date(b.session_detail?.date ?? b.recorded_at).getTime() -
              new Date(a.session_detail?.date ?? a.recorded_at).getTime()
          ),
    [records, loadedChild, selectedChild]
  );

  if (!kidsLoaded) return <LoadingState label="Loading…" />;
  if (kidsError) return <ErrorState message={kidsError} onRetry={retryKids} />;
  if (children.length === 0) {
    return (
      <EmptyState
        title="No linked children"
        body="Ask your school registrar to link your account."
      />
    );
  }
  if (!selectedChild || loadedChild !== selectedChild) {
    return <LoadingState label="Loading attendance…" />;
  }
  // A failed child-scoped fetch clears the records (see the effect above), so
  // it surfaces here rather than as an empty list.
  if (error) return <ErrorState message={error} onRetry={retryData} />;

  const activeChild = children.find((c) => String(c.id) === selectedChild);
  const subtitle = activeChild
    ? `${activeChild.user.full_name}${
        activeChild.section_name ? ` · ${activeChild.section_name}` : ''
      }`
    : undefined;

  return (
    <View style={styles.screen}>
      <AppHeader title="Attendance" subtitle={subtitle} />
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.navy700]}
          />
        }
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {children.length > 1 && (
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={selectedChild ?? undefined}
              onValueChange={(v: string) => setSelectedChild(v)}
              itemStyle={{ color: colors.text }}
              style={styles.picker}
              accessibilityLabel="Choose which child to view"
            >
              {children.map((c) => (
                <Picker.Item key={c.id} label={c.user.full_name} value={String(c.id)} />
              ))}
            </Picker>
          </View>
        )}

        {rows.length === 0 ? (
          <EmptyState
            inline
            title="No attendance records"
            body="Attendance will appear here after each class."
          />
        ) : (
          <ScreenList
            data={rows}
            keyExtractor={(item) => String(item.id)}
            renderItem={(item) => <RecordRow item={item} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
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
  pickerWrapper: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  picker: { height: 48 },
  errorText: { ...typography.muted, color: colors.red700 },
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
