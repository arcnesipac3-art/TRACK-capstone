/**
 * Account screen — the mobile `/profile` that every web role sidebar carries.
 *
 * Same content the web page shows (frontend: ProfilePage.jsx): the identity the
 * server has on file, read-only, with the instruction to ask an administrator
 * for a change. Nothing here is editable by design — `UserSerializer` marks
 * `role`, `is_active` and the name fields read-only, and the profile screen
 * must not pretend otherwise just because it is on a phone.
 *
 * Below the identity sits the role context the account's own token can already
 * read: a teacher's assignments, a student's enrollment row, a parent's linked
 * learners, an administrator's departments and effective permission keys (all
 * of which /auth/me/ already returns). Then the web's change-password form,
 * posting `old_password`/`new_password` to /auth/change-password/, and sign out.
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, tones, typography } from '../../theme';
import { ApiError, api, type SessionUser } from '../../api/client';
import type { StudentProfile, TeacherAssignment } from '../../api/types';
import { setSessionUser, useSessionUser } from '../../session-user';
import SignOutButton from '../../components/SignOutButton';
import { EmptyState, ErrorBanner, LoadingState } from '../../components/StateViews';
import AppHeader from '../../components/ui/AppHeader';
import BackLink from '../../components/ui/BackLink';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';

type ContextRow = { label: string; detail: string };

const ROLE_LABEL = {
  admin: 'Administrator',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent',
} as const;

/** What the role-context card is called, per role. */
const CONTEXT_TITLE = {
  admin: 'Access',
  teacher: 'Teaching assignments',
  student: 'Enrollment',
  parent: 'Linked learners',
} as const;

function detailOf(row: StudentProfile) {
  return [row.lrn ? `LRN ${row.lrn}` : null, row.section_name].filter(Boolean).join(' · ') || '—';
}

/**
 * The role's own rows, from lists this token is already allowed to read.
 *
 * `/students/` is scoped server-side — a student gets their single profile and
 * a parent gets their linked children — so this call widens nothing. An
 * administrator's context needs no call at all: /auth/me/ carries it.
 */
async function loadContext(role: keyof typeof ROLE_LABEL): Promise<ContextRow[]> {
  if (role === 'teacher') {
    const rows = await api.list<TeacherAssignment>('/teacher-assignments/');
    return rows.map((row) => ({ label: row.subject_name, detail: row.section_name }));
  }
  if (role === 'student') {
    const rows = await api.list<StudentProfile>('/students/');
    const own = rows[0];
    return own
      ? [
          { label: 'Learner number', detail: own.lrn || 'Not assigned' },
          { label: 'Section', detail: own.section_name || 'Not assigned' },
        ]
      : [];
  }
  if (role === 'parent') {
    const rows = await api.list<StudentProfile>('/students/');
    return rows.map((row) => ({ label: row.user.full_name, detail: detailOf(row) }));
  }
  return [];
}

function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const submit = async () => {
    setError('');
    setSuccess('');
    if (!current || !next) {
      setError('Enter your current and new password.');
      return;
    }
    if (next.length < 8) {
      setError('The new password must be at least 8 characters long.');
      return;
    }
    if (next !== confirm) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/change-password/', { old_password: current, new_password: next });
      // The server keeps this device's token alive, so the session does not
      // drop — the new password is for the next sign-in.
      setSuccess('Password updated. Use it the next time you sign in.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.stack}>
      {error ? <ErrorBanner message={error} /> : null}
      {success ? (
        <View style={styles.successBox}>
          <Text style={styles.successText}>{success}</Text>
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>CURRENT PASSWORD</Text>
        <TextInput
          style={styles.input}
          value={current}
          onChangeText={setCurrent}
          secureTextEntry={!show}
          autoComplete="current-password"
          textContentType="password"
          placeholder="••••••••"
          placeholderTextColor={colors.textSubtle}
          editable={!busy}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>NEW PASSWORD</Text>
        <TextInput
          style={styles.input}
          value={next}
          onChangeText={setNext}
          secureTextEntry={!show}
          autoComplete="new-password"
          textContentType="newPassword"
          placeholder="At least 8 characters"
          placeholderTextColor={colors.textSubtle}
          editable={!busy}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>CONFIRM NEW PASSWORD</Text>
        <TextInput
          style={styles.input}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry={!show}
          autoComplete="new-password"
          textContentType="newPassword"
          placeholder="Repeat the new password"
          placeholderTextColor={colors.textSubtle}
          editable={!busy}
        />
      </View>

      <View style={styles.formActions}>
        <TouchableOpacity
          onPress={() => setShow((visible) => !visible)}
          activeOpacity={0.7}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: show }}
          accessibilityLabel="Show passwords"
          style={styles.showToggle}
        >
          <Ionicons
            name={show ? 'eye-outline' : 'eye-off-outline'}
            size={16}
            color={colors.blue}
          />
          <Text style={styles.showLabel}>Show passwords</Text>
        </TouchableOpacity>
        <Button onPress={submit} loading={busy}>
          Change password
        </Button>
      </View>
    </View>
  );
}

/**
 * An administrator's access, read off the session payload itself.
 *
 * `/auth/me/` already carries departments and the effective permission keys, so
 * this role needs no second request — and a pure function keeps the effect
 * below free of anything that has to be awaited.
 */
function accessRows(user: SessionUser): ContextRow[] {
  const departments = (user.departments ?? []).map((d) => ({
    label: d.name,
    detail: d.code ? `${d.code}${d.is_active ? '' : ' · inactive'}` : '—',
  }));
  if (user.is_super_admin) {
    return [{ label: 'Super administrator', detail: 'every permission key' }, ...departments];
  }
  return [...departments, ...(user.permissions ?? []).map((key) => ({ label: key, detail: 'granted' }))];
}

export default function ProfileScreen() {
  const user = useSessionUser();
  const [rows, setRows] = useState<ContextRow[] | null>(null);
  const [contextError, setContextError] = useState('');

  const load = useCallback(async () => {
    if (!user || user.role === 'admin') return;
    try {
      setRows(await loadContext(user.role));
      setContextError('');
    } catch (err) {
      setContextError(err instanceof ApiError ? err.message : 'Could not load your account rows.');
    }
  }, [user]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // The identity card reads the session this app published at sign-in, so a
      // refresh has to re-read /auth/me/ and publish the answer — otherwise an
      // administrator's change to the account never shows up here.
      setSessionUser(await api.me());
      await load();
    } catch (err) {
      setContextError(err instanceof ApiError ? err.message : 'Could not refresh your account.');
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  if (!user) return <LoadingState label="Loading your account…" />;

  const context = user.role === 'admin' ? accessRows(user) : rows;

  const fields: [string, string][] = [
    ['Full name', user.full_name || '—'],
    ['Username', user.username],
    ['Email', user.email || '—'],
    ['Role', ROLE_LABEL[user.role] ?? user.role],
    ['Account status', user.is_active ? 'Active' : 'Inactive'],
  ];

  return (
    <View style={styles.screen}>
      <AppHeader
        eyebrow="Account"
        title="My profile"
        subtitle="Your TRACK account as it is stored on the server."
        right={<SignOutButton variant="onNavy" />}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            colors={[colors.blue]}
            tintColor={colors.blue}
          />
        }
      >
        <BackLink label="Back" onPress={() => router.back()} />

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Identity</Text>
            <Badge label={ROLE_LABEL[user.role] ?? user.role} tone="blue" glyph={false} />
          </View>
          {fields.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.rowLabel}>{label}</Text>
              <Text style={styles.rowValue}>{value}</Text>
            </View>
          ))}
          <Text style={styles.note}>
            Ask the school administrator to update your name, email or role.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{CONTEXT_TITLE[user.role] ?? 'Account'}</Text>
          {contextError ? (
            <ErrorBanner message={contextError} onRetry={load} />
          ) : context === null ? (
            <Text style={styles.rowLabel}>Loading…</Text>
          ) : context.length > 0 ? (
            context.map((row) => (
              <View key={`${row.label}-${row.detail}`} style={styles.row}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowValue}>{row.detail}</Text>
              </View>
            ))
          ) : (
            <EmptyState
              inline
              title="Nothing on record"
              body="This account has no rows to show here yet."
            />
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Change password</Text>
          <PasswordForm />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Session</Text>
          <Text style={styles.note}>
            Signing out revokes this device&apos;s token on the server, not only on the phone.
          </Text>
          <SignOutButton />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: { ...typography.heading, color: colors.navy },
  row: { gap: 2, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { ...typography.label, color: colors.textSubtle, textTransform: 'uppercase' },
  rowValue: { ...typography.body, color: colors.text },
  note: { ...typography.muted, lineHeight: 19 },
  successBox: {
    backgroundColor: tones.green.background,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  successText: { ...typography.muted, color: colors.greenText },
  stack: { gap: spacing.md },
  field: { gap: 6 },
  fieldLabel: { ...typography.label, color: colors.textSubtle },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 42,
    ...typography.input,
  },
  formActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  showToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingRight: spacing.sm },
  showLabel: { ...typography.label, color: colors.blue },
});
