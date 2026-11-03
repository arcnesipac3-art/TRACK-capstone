/**
 * Admin accounts — the management half of the web app's UsersPage.
 *
 * The Directory screen next to this one is deliberately read-only; this is the
 * registrar's write side: one list per role (students, teachers, parents), an
 * account editor, a password reset and deactivate/reactivate. Accounts are
 * never deleted — deactivating keeps every record and only blocks sign-in,
 * which is the rule the server enforces too.
 *
 * Which actions appear is decided by the session's permission keys (the same
 * `can()` the web sidebar uses), and every one of those keys is checked again
 * by Django on the request itself. A read-only administrator therefore sees a
 * list with no buttons rather than a list of buttons that fail.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, typography } from '../../../theme';
import { ApiError, api } from '../../../api/client';
import type { AdminUser } from '../../../api/types';
import type { Role } from '../../../api/client';
import { canKey, useSessionUser } from '../../../session-user';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import AppHeader from '../../../components/ui/AppHeader';
import BackLink from '../../../components/ui/BackLink';
import Badge from '../../../components/ui/Badge';
import SegmentedControl from '../../../components/ui/SegmentedControl';

type Segment = Extract<Role, 'student' | 'teacher' | 'parent'>;

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: 'student', label: 'Students' },
  { value: 'teacher', label: 'Teachers' },
  { value: 'parent', label: 'Parents' },
];

const TITLES: Record<Segment, string> = {
  student: 'Learner accounts on record.',
  teacher: 'Teaching accounts on record.',
  parent: 'Guardian accounts on record.',
};

/** The key that lets this actor write this particular account. */
function writeKey(user: AdminUser): string {
  return user.role === 'admin' ? 'users.manage_admins' : user.role === 'student' ? 'students.manage' : 'users.manage';
}

export default function AdminAccountsScreen() {
  const me = useSessionUser();
  const [segment, setSegment] = useState<Segment>('student');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await api.list<AdminUser>('/users/', { params: { role: segment } }));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the accounts.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [segment]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const canCreate =
    segment === 'student' ? canKey(me, 'students.manage') : canKey(me, 'users.manage');

  if (loading) return <LoadingState label="Loading accounts…" />;
  if (error && users.length === 0) {
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setLoading(true);
          load();
        }}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <AppHeader title="Accounts" subtitle="Create, edit and reset sign-in accounts." />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            colors={[colors.blue]}
          />
        }
      >
        <BackLink label="Back" onPress={() => router.back()} />

        <SegmentedControl options={SEGMENTS} value={segment} onChange={setSegment} />

        <View style={styles.metaRow}>
          <Badge label={`${users.length} ${users.length === 1 ? 'account' : 'accounts'}`} tone="blue" glyph={false} />
          {canCreate && (
            <TouchableOpacity
              style={styles.newButton}
              onPress={() => router.push(`/admin/accounts/new?role=${segment}`)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`New ${segment} account`}
            >
              <Ionicons name="person-add-outline" size={16} color={colors.onNavy} />
              <Text style={styles.newLabel}>New account</Text>
            </TouchableOpacity>
          )}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {users.length === 0 ? (
          <EmptyState
            inline
            title="No accounts"
            body={`Nothing matches this view yet${canCreate ? ' — create the first one above.' : '.'}`}
          />
        ) : (
          users.map((user) => {
            const editable = canKey(me, writeKey(user));
            return (
              <TouchableOpacity
                key={user.id}
                style={styles.card}
                onPress={() => router.push(`/admin/accounts/${user.id}`)}
                activeOpacity={editable ? 0.8 : 1}
                disabled={!editable}
                accessibilityRole="button"
                accessibilityLabel={editable ? `Edit ${user.full_name}` : undefined}
              >
                <View style={styles.cardHead}>
                  <Text style={styles.title} numberOfLines={1}>
                    {user.full_name || user.username}
                    {me && user.id === me.id ? ' (you)' : ''}
                  </Text>
                  <Badge label={user.is_active ? 'Active' : 'Inactive'} tone={user.is_active ? 'green' : 'red'} />
                </View>
                <Text style={styles.meta}>@{user.username}</Text>
                <Text style={styles.meta}>{user.email || 'No email on file'}</Text>
                {!editable ? <Text style={styles.locked}>Read-only for your access level.</Text> : null}
              </TouchableOpacity>
            );
          })
        )}

        <Text style={styles.footnote}>
          {TITLES[segment]} Accounts are created here by the registrar. Deactivating an account
          keeps its records and only blocks sign-in — accounts are never deleted.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    backgroundColor: colors.navy,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  newLabel: { ...typography.label, color: colors.onNavy },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { ...typography.heading, color: colors.navy, flexShrink: 1 },
  meta: { ...typography.muted },
  locked: { ...typography.muted, color: colors.textSubtle, fontStyle: 'italic' },
  errorText: { ...typography.muted, color: colors.redText },
  footnote: { ...typography.muted, lineHeight: 19 },
});
