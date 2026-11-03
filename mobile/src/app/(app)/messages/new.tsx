/**
 * Messages — start a thread.
 *
 * On the web this is a modal over a three-column page; here it is a pushed
 * route, because a phone cannot show a picker, a search field and a list of
 * results inside one small dialog without making all of them cramped.
 *
 * Same contract as the web dialog: it offers only what `/api/messaging/options/`
 * says this account may create (the classes it teaches, the departments it
 * administers) and only the people `/api/messaging/contacts/` returned, which
 * is already the server's answer to "who may this person message". Creating
 * anything else is refused by the endpoint regardless of what is rendered here.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { colors, radius, spacing, typography } from '../../../theme';
import { messaging } from '../../../api/messaging';
import type { ContactRow, ConversationDetail, MessagingOptions } from '../../../api/types';
import AppHeader from '../../../components/ui/AppHeader';
import Badge from '../../../components/ui/Badge';
import ScreenList from '../../../components/ScreenList';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';

type Mode = 'person' | 'group';
type GroupKind = 'group' | 'class' | 'department';

const MATCH_LIMIT = 20;

export default function NewConversationScreen() {
  const [options, setOptions] = useState<MessagingOptions | null>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [mode, setMode] = useState<Mode>('person');
  const [term, setTerm] = useState('');
  const [kind, setKind] = useState<GroupKind>('group');
  const [title, setTitle] = useState('');
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [memberIds, setMemberIds] = useState<number[]>([]);

  const load = useCallback(async () => {
    try {
      const [opts, people] = await Promise.all([messaging.options(), messaging.contacts()]);
      setOptions(opts);
      setContacts(people);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load who you may message.');
    }
  }, []);

  useEffect(() => {
    // Every state update inside `load` happens after an `await`. The rule reads
    // the call, not the schedule, so it flags a mount fetch it cannot prove
    // synchronous — the same reason the five existing fees screens report it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const kinds = useMemo(() => {
    const list: { id: GroupKind; label: string }[] = [{ id: 'group', label: 'Group' }];
    if ((options?.sections || []).length) list.push({ id: 'class', label: 'Class' });
    if ((options?.departments || []).length) list.push({ id: 'department', label: 'Department' });
    return list;
  }, [options]);

  const matches = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return contacts.slice(0, MATCH_LIMIT);
    return contacts
      .filter((row) =>
        `${row.full_name} ${row.username} ${row.detail}`.toLowerCase().includes(needle)
      )
      .slice(0, MATCH_LIMIT);
  }, [contacts, term]);

  const blocked =
    !title.trim() ||
    (kind === 'class' && sectionId == null) ||
    (kind === 'department' && departmentId == null);

  async function create(open: () => Promise<ConversationDetail>) {
    setBusy(true);
    setFormError(null);
    try {
      const thread = await open();
      // Replace, not push: the composer behind this screen is not a place to
      // go "back" to once the thread exists.
      router.replace(`/messages/${thread.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'That conversation could not be created.');
    } finally {
      setBusy(false);
    }
  }

  function submitGroup(): Promise<ConversationDetail> {
    // `blocked` keeps the button inert until the required id is chosen, so the
    // non-null assertions here are the guard, not a guess.
    if (kind === 'class') {
      return messaging.createGroup({ kind, title: title.trim(), section_id: sectionId! });
    }
    if (kind === 'department') {
      return messaging.createGroup({ kind, title: title.trim(), department_id: departmentId! });
    }
    return messaging.createGroup({ kind: 'group', title: title.trim(), member_ids: memberIds });
  }

  if (error && !options) return <ErrorState message={error} onRetry={load} />;
  // Derived, not state: the screen is loading until the options call lands.
  if (!options) return <LoadingState label="Loading who you can message…" />;

  return (
    <View style={styles.screen}>
      <AppHeader
        title="New conversation"
        eyebrow="Messages"
        subtitle="Only people TRACK lets this account write to are listed."
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {options?.can_create_group ? (
          <View style={styles.segment}>
            {(['person', 'group'] as Mode[]).map((value) => (
              <TouchableOpacity
                key={value}
                style={[styles.segmentItem, mode === value && styles.segmentItemActive]}
                activeOpacity={0.8}
                onPress={() => setMode(value)}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === value }}
              >
                <Text style={[styles.segmentLabel, mode === value && styles.segmentLabelActive]}>
                  {value === 'person' ? 'A person' : 'A group'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

        <TextInput
          value={term}
          onChangeText={setTerm}
          placeholder={mode === 'person' ? 'Name, username or class' : 'Filter the people listed below'}
          placeholderTextColor={colors.textSubtle}
          style={styles.search}
          accessibilityLabel="Find a person"
          autoCorrect={false}
          returnKeyType="search"
        />

        {mode === 'person' ? (
          matches.length === 0 ? (
            <EmptyState inline title="No reachable person by that name" body="Try part of a name instead." />
          ) : (
            <ScreenList
              data={matches}
              keyExtractor={(item) => String(item.id)}
              renderItem={(row) => (
                <TouchableOpacity
                  style={styles.row}
                  activeOpacity={0.7}
                  disabled={busy}
                  onPress={() => create(() => messaging.createDirect(row.id))}
                  accessibilityRole="button"
                  accessibilityLabel={`Message ${row.full_name}`}
                >
                  <View style={styles.rowTexts}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {row.full_name}
                    </Text>
                    <Text style={styles.rowDetail} numberOfLines={1}>
                      {row.role}
                      {row.detail ? ` · ${row.detail}` : ''}
                    </Text>
                  </View>
                  {row.online ? <Badge label="Online" tone="green" glyph={false} /> : null}
                  <Text style={styles.rowAction}>{busy ? '…' : 'Message'}</Text>
                </TouchableOpacity>
              )}
            />
          )
        ) : (
          <View style={styles.form}>
            <Text style={styles.fieldLabel}>Type</Text>
            <View style={styles.chips}>
              {kinds.map((row) => (
                <TouchableOpacity
                  key={row.id}
                  style={[styles.chip, kind === row.id && styles.chipActive]}
                  activeOpacity={0.8}
                  onPress={() => {
                    setKind(row.id);
                    setMemberIds([]);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: kind === row.id }}
                >
                  <Text style={[styles.chipLabel, kind === row.id && styles.chipLabelActive]}>
                    {row.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Chess club"
              placeholderTextColor={colors.textSubtle}
              maxLength={120}
              style={styles.input}
              accessibilityLabel="Conversation name"
            />

            {kind === 'class' ? (
              <>
                <Text style={styles.fieldLabel}>Class</Text>
                <View style={styles.picker}>
                  {(options?.sections || []).map((row) => (
                    <TouchableOpacity
                      key={row.id}
                      style={[styles.pickerItem, sectionId === row.id && styles.pickerItemActive]}
                      activeOpacity={0.8}
                      onPress={() => setSectionId(row.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sectionId === row.id }}
                    >
                      <Text style={[styles.pickerLabel, sectionId === row.id && styles.pickerLabelActive]}>
                        {row.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            {kind === 'department' ? (
              <>
                <Text style={styles.fieldLabel}>Department</Text>
                <View style={styles.picker}>
                  {(options?.departments || []).map((row) => (
                    <TouchableOpacity
                      key={row.id}
                      style={[styles.pickerItem, departmentId === row.id && styles.pickerItemActive]}
                      activeOpacity={0.8}
                      onPress={() => setDepartmentId(row.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: departmentId === row.id }}
                    >
                      <Text style={[styles.pickerLabel, departmentId === row.id && styles.pickerLabelActive]}>
                        {row.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            {kind === 'group' ? (
              <>
                <Text style={styles.fieldLabel}>First members</Text>
                {matches.length === 0 ? (
                  <Text style={styles.hint}>No reachable person by that name.</Text>
                ) : (
                  <View style={styles.members}>
                    {matches.map((row) => {
                      const selected = memberIds.includes(row.id);
                      return (
                        <TouchableOpacity
                          key={row.id}
                          style={styles.memberRow}
                          activeOpacity={0.8}
                          onPress={() =>
                            setMemberIds((current) =>
                              selected
                                ? current.filter((id) => id !== row.id)
                                : [...current, row.id]
                            )
                          }
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                        >
                          <View style={[styles.checkbox, selected && styles.checkboxOn]} />
                          <Text style={styles.memberName} numberOfLines={1}>
                            {row.full_name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            ) : null}

            <Text style={styles.hint}>
              {kind === 'class'
                ? 'A class thread enrolls the section’s students, their parents and its teachers, and re-checks that roster every time it is opened.'
                : kind === 'department'
                  ? 'A department thread holds the administrators of that department.'
                  : 'Only people you may message can be added.'}
            </Text>

            <TouchableOpacity
              style={[styles.submit, blocked && styles.submitDisabled]}
              activeOpacity={0.85}
              disabled={blocked || busy}
              onPress={() => create(submitGroup)}
              accessibilityRole="button"
            >
              <Text style={styles.submitLabel}>{busy ? 'Creating…' : 'Create conversation'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segmentItem: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  segmentItemActive: { backgroundColor: colors.blue },
  segmentLabel: { ...typography.label, color: colors.textMuted },
  segmentLabelActive: { color: colors.onNavy },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 1,
    ...typography.body,
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowTexts: { flex: 1, gap: 2 },
  rowName: { ...typography.body, fontWeight: '700' },
  rowDetail: { ...typography.subtle },
  rowAction: { ...typography.label, color: colors.blue },
  form: { gap: spacing.sm },
  fieldLabel: { ...typography.label, color: colors.textMuted, marginTop: spacing.xs },
  chips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  chipActive: { backgroundColor: colors.blueTint, borderColor: colors.blueText },
  chipLabel: { ...typography.label, color: colors.textMuted },
  chipLabelActive: { color: colors.blueText },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 1,
    ...typography.body,
    color: colors.text,
  },
  picker: { gap: spacing.xs },
  pickerItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pickerItemActive: { borderColor: colors.blue, backgroundColor: colors.blueWash },
  pickerLabel: { ...typography.body, color: colors.textMuted },
  pickerLabelActive: { color: colors.blue, fontWeight: '700' },
  members: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingVertical: spacing.xs,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.borderStrong,
  },
  checkboxOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  memberName: { ...typography.body, color: colors.text, flex: 1 },
  hint: { ...typography.subtle },
  errorText: { ...typography.muted, color: colors.redText },
  submit: {
    backgroundColor: colors.blue,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitDisabled: { backgroundColor: colors.borderStrong },
  submitLabel: { ...typography.buttonText, color: colors.onNavy },
});
