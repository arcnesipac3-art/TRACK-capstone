/**
 * Parent children list — entry point to per-child detail.
 *
 * Backed by GET /students/, which for a parent returns exactly their linked
 * children (server-enforced). The row's `id` is the **StudentProfile pk** —
 * the id space every `?child=` / `?student=` query parameter uses. An earlier
 * version derived ids from the dashboard's `user.id`, which both crashed on a
 * shape the backend never sent and passed the wrong id downstream.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenList from '../../../components/ScreenList';
import { useRouter } from 'expo-router';

import { colors, spacing, radius, typography } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import type { StudentProfile } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import AppHeader from '../../../components/ui/AppHeader';

export default function ParentChildrenScreen() {
  const router = useRouter();
  const [children, setChildren] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.list<StudentProfile>('/students/');
      setChildren(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your children.');
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

  if (loading) return <LoadingState label="Loading your children…" />;
  if (error && children.length === 0) {
    return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;
  }

  return (
    <View style={styles.screen}>
      <AppHeader title="My Children" subtitle="Tap a child to see their requirements and attendance." />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.navy700]} />}
        contentContainerStyle={styles.content}
      >
        <ScreenList
          data={children}
          keyExtractor={(item) => String(item.id)}
          renderItem={(item) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/parent/requirements?child=${item.id}`)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.user.full_name}'s requirements`}
            >
              <View style={styles.row}>
                <View style={styles.grow}>
                  <Text style={styles.name}>{item.user.full_name}</Text>
                  <Text style={styles.meta}>@{item.user.username}</Text>
                  {item.section_name && <Text style={styles.meta}>{item.section_name}</Text>}
                  {item.lrn ? <Text style={styles.meta}>LRN: {item.lrn}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={styles.chevron} />
              </View>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <EmptyState
              inline
              title="No linked children"
              body="Ask your school registrar to link your account."
            />
          }
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  grow: { flex: 1 },
  name: { ...typography.heading, color: colors.navy900 },
  meta: { ...typography.muted, marginTop: 2 },
  chevron: { marginLeft: spacing.sm },
  separator: { height: 1 },
});
