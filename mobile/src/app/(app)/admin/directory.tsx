/**
 * Admin directory — people and school structure, read-only.
 *
 * Endpoints: GET /students/, GET /users/?role=teacher|parent (admin-only,
 * enforced server-side), GET /sections/. Account management stays on the web
 * app; this screen exists to *see* the data, mirroring the web directory.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import ScreenList from '../../../components/ScreenList';

import { colors, spacing, radius, typography } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import type { AdminUser, Section, StudentProfile } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import AppHeader from '../../../components/ui/AppHeader';
import SegmentedControl from '../../../components/ui/SegmentedControl';

type Segment = 'students' | 'teachers' | 'parents' | 'sections';

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: 'students', label: 'Students' },
  { value: 'teachers', label: 'Teachers' },
  { value: 'parents', label: 'Parents' },
  { value: 'sections', label: 'Sections' },
];

export default function AdminDirectoryScreen() {
  const [segment, setSegment] = useState<Segment>('students');
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [teachers, setTeachers] = useState<AdminUser[]>([]);
  const [parents, setParents] = useState<AdminUser[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, t, p, sec] = await Promise.all([
        api.list<StudentProfile>('/students/'),
        api.list<AdminUser>('/users/', { params: { role: 'teacher' } }),
        api.list<AdminUser>('/users/', { params: { role: 'parent' } }),
        api.list<Section>('/sections/'),
      ]);
      setStudents(s);
      setTeachers(t);
      setParents(p);
      setSections(sec);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the directory.');
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

  if (loading) return <LoadingState label="Loading directory…" />;
  if (error && students.length === 0 && teachers.length === 0) {
    return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;
  }

  const rows: { key: string; title: string; lines: string[] }[] =
    segment === 'students'
      ? students.map((s) => ({
          key: `s${s.id}`,
          title: s.user.full_name,
          lines: [
            `@${s.user.username}`,
            s.section_name ?? 'No section',
            s.lrn ? `LRN: ${s.lrn}` : '',
          ].filter(Boolean),
        }))
      : segment === 'teachers'
        ? teachers.map((u) => ({
            key: `t${u.id}`,
            title: u.full_name,
            lines: [`@${u.username}`, u.email ?? '', u.is_active ? '' : 'Inactive'].filter(Boolean),
          }))
        : segment === 'parents'
          ? parents.map((u) => ({
              key: `p${u.id}`,
              title: u.full_name,
              lines: [`@${u.username}`, u.email ?? '', u.is_active ? '' : 'Inactive'].filter(Boolean),
            }))
          : sections.map((s) => ({
              key: `sec${s.id}`,
              title: `${s.grade_level_name} — ${s.name}`,
              lines: [
                `${s.student_count} students`,
                s.adviser_name ? `Adviser: ${s.adviser_name}` : 'No adviser',
                s.school_year_label,
              ],
            }));

  return (
    <View style={styles.screen}>
      <AppHeader title="Directory" subtitle="Students, teachers, parents and sections." />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.navy700]} />}
      >
        <SegmentedControl options={SEGMENTS} value={segment} onChange={setSegment} />

        {error && <Text style={styles.errorText}>{error}</Text>}

        {rows.length === 0 ? (
          <EmptyState inline title={`No ${segment} yet`} />
        ) : (
          <ScreenList
            data={rows}
            keyExtractor={(item) => item.key}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={(item) => (
              <View style={styles.card}>
                <Text style={styles.title}>{item.title}</Text>
                {item.lines.map((line, i) => (
                  <Text key={i} style={styles.meta}>{line}</Text>
                ))}
              </View>
            )}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  errorText: { ...typography.muted, color: colors.red700 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  title: { ...typography.heading, color: colors.navy900 },
  meta: { ...typography.muted },
  separator: { height: 1 },
});
