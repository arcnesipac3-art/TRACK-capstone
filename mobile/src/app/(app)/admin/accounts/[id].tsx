/**
 * Admin account editor — create one account, or edit an existing one.
 *
 * The mobile shape of the web's user form modal (frontend: UserFormModal): the
 * name fields, username and email, the student extras (LRN and section) and the
 * initial password a new account needs. `POST /users/` and `PATCH /users/<id>/`
 * are the same two calls the web makes, and Django re-checks the permission key
 * for the write itself — the gating here only decides what this screen offers.
 *
 * Three things are deliberately not on a phone: assigning departments, granting
 * extra permission keys and linking a parent to children. They are multi-select
 * registrar work that the web app already covers; half-building them here would
 * put a school's access model behind a 44px touch target.
 *
 * Accounts are never deleted. Deactivating keeps every record and blocks sign-in.
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { colors, radius, spacing, typography } from '../../../../theme';
import { ApiError, api, type Role } from '../../../../api/client';
import type { AdminUser, Section, StudentProfile } from '../../../../api/types';
import { canKey, useSessionUser } from '../../../../session-user';
import { ErrorBanner, LoadingState } from '../../../../components/StateViews';
import AppHeader from '../../../../components/ui/AppHeader';
import BackLink from '../../../../components/ui/BackLink';
import Badge from '../../../../components/ui/Badge';
import Button from '../../../../components/ui/Button';
import ConfirmRow from '../../../../components/ui/ConfirmRow';
import Dropdown from '../../../../components/ui/Dropdown';
import SegmentedControl from '../../../../components/ui/SegmentedControl';

const MANAGE_ROLES: { value: Extract<Role, 'student' | 'teacher' | 'parent'>; label: string }[] = [
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'parent', label: 'Parent' },
];

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrator',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent',
};

type Draft = {
  first_name: string;
  middle_name: string;
  last_name: string;
  username: string;
  email: string;
  role: Extract<Role, 'student' | 'teacher' | 'parent'>;
  password: string;
  lrn: string;
  section: number | null;
};

const EMPTY: Draft = {
  first_name: '',
  middle_name: '',
  last_name: '',
  username: '',
  email: '',
  role: 'student',
  password: '',
  lrn: '',
  section: null,
};

/** The key needed to write this account — the web's rule, same names. */
function writeKeyFor(role: Role): string {
  return role === 'admin' ? 'users.manage_admins' : role === 'student' ? 'students.manage' : 'users.manage';
}

export default function AdminAccountEditorScreen() {
  const { id, role } = useLocalSearchParams<{ id: string; role?: string }>();
  const userId = parseInt(id ?? '', 10);
  const isNew = id === 'new';
  const me = useSessionUser();

  const [draft, setDraft] = useState<Draft>({
    ...EMPTY,
    role: MANAGE_ROLES.some((r) => r.value === role) ? (role as Draft['role']) : 'student',
  });
  const [account, setAccount] = useState<AdminUser | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [reset, setReset] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmToggle, setConfirmToggle] = useState(false);

  const displayName = account?.full_name || account?.username || 'This account';

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const load = useCallback(async () => {
    if (isNew) return;
    try {
      const user = await api.get<AdminUser>(`/users/${userId}/`);
      setAccount(user);
      setDraft({
        ...EMPTY,
        first_name: user.first_name,
        middle_name: user.middle_name ?? '',
        last_name: user.last_name,
        username: user.username,
        email: user.email ?? '',
        // Only ever the create picker's value. An `admin` account cannot be
        // represented in this draft — nothing reads it back for display or for
        // the PATCH body, which is what kept the label honest.
        role: user.role === 'teacher' || user.role === 'parent' ? user.role : 'student',
      });
      if (user.role === 'student') {
        // `section` and `lrn` are write-only on /users/, so a student's current
        // enrollment is read from the profile row the same token can already see.
        const profiles = await api.list<StudentProfile>('/students/');
        const own = profiles.find((p) => p.user.id === user.id);
        if (own) {
          setDraft((prev) => ({ ...prev, lrn: own.lrn ?? '', section: own.section }));
        }
      }
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this account.');
    } finally {
      setLoading(false);
    }
  }, [isNew, userId]);

  useEffect(() => {
    (async () => {
      // Sections are needed for any student form, new or existing.
      const list = await api.list<Section>('/sections/').catch(() => [] as Section[]);
      setSections(list);
      await load();
    })();
  }, [load]);

  if (loading) return <LoadingState label="Loading account…" />;

  const roleForKeys: Role = account?.role ?? draft.role;
  const editable = canKey(me, writeKeyFor(roleForKeys));
  // The account's own role, not the draft's: an administrator opened by id is
  // still an administrator here, even though the create picker offers no such
  // option. Reading `draft.role` would show a teacher's form around an admin.
  const isStudent = roleForKeys === 'student';
  const isSelf = !!account && !!me && account.id === me.id;

  const save = async () => {
    setNotice('');
    if (!draft.first_name.trim() || !draft.last_name.trim()) {
      setError('First and last name are required.');
      return;
    }
    if (!draft.username.trim()) {
      setError('A username is required.');
      return;
    }
    if (isNew && !draft.password) {
      setError('Set an initial password.');
      return;
    }
    if (isNew && isStudent && !draft.lrn.trim()) {
      setError('A Learner Reference Number is required for students.');
      return;
    }
    setSaving(true);
    setError('');
    const body: Record<string, unknown> = {
      first_name: draft.first_name.trim(),
      middle_name: draft.middle_name.trim(),
      last_name: draft.last_name.trim(),
      username: draft.username.trim(),
      email: draft.email.trim(),
    };
    // Role only rides along on a create. The web disables its role select while
    // editing ("Roles cannot be changed after creation."), and this screen's
    // picker cannot even represent `admin` — sending the draft's role on a PATCH
    // would quietly re-role whoever was opened.
    if (isNew) body.role = draft.role;
    if (isStudent) {
      body.lrn = draft.lrn.trim();
      body.section = draft.section;
    }
    if (isNew) body.password = draft.password;
    try {
      if (isNew) await api.post('/users/', body);
      else await api.patch(`/users/${userId}/`, body);
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this account.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Deactivate or reactivate — a PATCH of `is_active`, never a delete.
   *
   * The question is armed inline rather than in an `Alert`, because
   * `Alert.alert` renders nothing on web: the button pressed and did nothing.
   */
  const applyToggleActive = async () => {
    if (!account) return;
    const next = !account.is_active;
    setConfirmToggle(false);
    setSaving(true);
    try {
      await api.patch(`/users/${account.id}/`, { is_active: next });
      setAccount({ ...account, is_active: next });
      setNotice(next ? `${displayName} can sign in again.` : `${displayName} can no longer sign in.`);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change this account.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Set another account's password.
   *
   * React Native has no cross-platform text prompt (`Alert.prompt` is iOS-only
   * and `Alert.alert` does not render at all on web), so the new password is
   * collected in the card itself — the same three lines the web's reset modal
   * uses, on a screen instead of a dialog.
   */
  const resetPassword = async () => {
    if (!account) return;
    const value = reset.trim();
    if (!value) {
      setError('Type the new password first.');
      return;
    }
    if (value.length < 8) {
      setError('The new password must be at least 8 characters long.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/auth/reset-password/', { user_id: account.id, new_password: value });
      setReset('');
      setNotice(
        `Password reset for ${account.full_name || account.username}. Tell them the new password.`
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset this password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <AppHeader
        eyebrow={isNew ? `New ${draft.role} account` : ROLE_LABEL[roleForKeys]}
        title={isNew ? 'New account' : account?.full_name || account?.username || 'Account'}
        subtitle={isNew ? undefined : account?.username ? `@${account.username}` : undefined}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BackLink label="Back" onPress={() => router.back()} />

        {error ? <ErrorBanner message={error} /> : null}
        {notice ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        {!editable ? (
          <View style={styles.locked}>
            <Text style={styles.lockedText}>
              Your access level can read accounts but not change them, so this form is
              closed. The server enforces the same rule on the request.
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          {isNew ? (
            <View style={styles.field}>
              <Text style={styles.label}>ROLE</Text>
              <SegmentedControl
                options={MANAGE_ROLES}
                value={draft.role}
                onChange={(v) => set('role', v)}
              />
              <Text style={styles.hint}>
                Administrator accounts are created on the web, where departments and
                permission keys are assigned.
              </Text>
            </View>
          ) : (
            <View style={styles.field}>
              <View style={styles.statusRow}>
                <Text style={styles.label}>ROLE</Text>
                <Badge label={ROLE_LABEL[roleForKeys]} tone="blue" glyph={false} />
              </View>
              <Text style={styles.hint}>Roles cannot be changed after creation.</Text>
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>FIRST NAME</Text>
            <TextInput style={styles.input} value={draft.first_name} onChangeText={(v) => set('first_name', v)} autoCapitalize="words" editable={editable} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>MIDDLE NAME (OPTIONAL)</Text>
            <TextInput style={styles.input} value={draft.middle_name} onChangeText={(v) => set('middle_name', v)} autoCapitalize="words" editable={editable} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>LAST NAME</Text>
            <TextInput style={styles.input} value={draft.last_name} onChangeText={(v) => set('last_name', v)} autoCapitalize="words" editable={editable} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>USERNAME</Text>
            <TextInput style={styles.input} value={draft.username} onChangeText={(v) => set('username', v)} autoCapitalize="none" autoCorrect={false} editable={editable} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput style={styles.input} value={draft.email} onChangeText={(v) => set('email', v)} autoCapitalize="none" keyboardType="email-address" editable={editable} />
          </View>

          {isNew && (
            <View style={styles.field}>
              <Text style={styles.label}>INITIAL PASSWORD</Text>
              <TextInput
                style={styles.input}
                value={draft.password}
                onChangeText={(v) => set('password', v)}
                secureTextEntry
                autoComplete="new-password"
                placeholder="At least 8 characters"
                placeholderTextColor={colors.textSubtle}
                editable={editable}
              />
              <Text style={styles.hint}>
                It must pass the same strength rules as a self-service change; the server
                checks it before the account is created.
              </Text>
            </View>
          )}
        </View>

        {isStudent && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Enrollment</Text>
            <View style={styles.field}>
              <Text style={styles.label}>LEARNER REFERENCE NUMBER</Text>
              <TextInput
                style={styles.input}
                value={draft.lrn}
                onChangeText={(v) => set('lrn', v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={12}
                editable={editable}
              />
            </View>
            <Dropdown
              label="Section"
              placeholder="No section"
              options={sections.map((s) => ({ label: `${s.grade_level_name} — ${s.name} (${s.school_year_label})`, value: s.id }))}
              value={draft.section}
              onChange={(v) => set('section', v)}
            />
          </View>
        )}

        {editable && (
          <View style={styles.actions}>
            <Button onPress={save} loading={saving} block>
              {isNew ? 'Create account' : 'Save changes'}
            </Button>
          </View>
        )}

        {!isNew && account && editable && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Security</Text>
            <View style={styles.statusRow}>
              <Text style={styles.meta}>
                {account.is_active ? 'Active — can sign in.' : 'Inactive — sign-in is blocked; every record is kept.'}
              </Text>
              <Badge label={account.is_active ? 'Active' : 'Inactive'} tone={account.is_active ? 'green' : 'red'} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>NEW PASSWORD</Text>
              <TextInput
                style={styles.input}
                value={reset}
                onChangeText={setReset}
                secureTextEntry
                autoComplete="new-password"
                placeholder="At least 8 characters"
                placeholderTextColor={colors.textSubtle}
                editable={!saving}
              />
            </View>
            <Button variant="secondary" onPress={resetPassword} disabled={saving}>
              Reset password
            </Button>
            {confirmToggle ? (
              <ConfirmRow
                message={
                  account.is_active
                    ? `${displayName} will not be able to sign in until the account is reactivated. No record of theirs is deleted.`
                    : `${displayName} will be able to sign in again, with the account as it is now.`
                }
                confirmLabel={account.is_active ? 'Deactivate' : 'Reactivate'}
                tone={account.is_active ? 'danger' : 'primary'}
                onConfirm={applyToggleActive}
                onCancel={() => setConfirmToggle(false)}
                busy={saving}
              />
            ) : (
              <Button
                variant={account.is_active ? 'danger' : 'secondary'}
                onPress={() => setConfirmToggle(true)}
                disabled={saving || isSelf}
              >
                {account.is_active ? 'Deactivate account' : 'Reactivate account'}
              </Button>
            )}
            {isSelf && (
              <Text style={styles.hint}>You cannot deactivate your own account.</Text>
            )}
            <Text style={styles.hint}>
              There is no delete here on purpose: an account that signed in, handed work in
              or was marked present stays on record.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: { ...typography.heading, color: colors.navy },
  field: { gap: 6 },
  label: { ...typography.label, color: colors.textSubtle },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 42,
    ...typography.input,
  },
  hint: { ...typography.muted, lineHeight: 18 },
  meta: { ...typography.muted },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  actions: { gap: spacing.sm },
  notice: {
    backgroundColor: colors.greenTint,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noticeText: { ...typography.muted, color: colors.greenText },
  locked: {
    backgroundColor: colors.redTint,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  lockedText: { ...typography.muted, color: colors.redText, lineHeight: 19 },
});
