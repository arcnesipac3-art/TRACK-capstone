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
 *
 * What the phone version now does differently is show one question at a time:
 * the person list is a directory you tap once, and the group form reveals only
 * the control its chosen type needs — a class picks a class, not a name field
 * plus two disabled pickers.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, touch, typography } from '../../../theme';
import { countNoun } from '../../../format';
import { messaging } from '../../../api/messaging';
import type { ContactRow, ConversationDetail, MessagingOptions } from '../../../api/types';
import AppHeader from '../../../components/ui/AppHeader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Chip from '../../../components/ui/Chip';
import Dropdown from '../../../components/ui/Dropdown';
import Field from '../../../components/ui/Field';
import ListRow from '../../../components/ui/ListRow';
import Screen from '../../../components/ui/Screen';
import SearchField from '../../../components/ui/SearchField';
import SectionHeader from '../../../components/ui/SectionHeader';
import SegmentedControl from '../../../components/ui/SegmentedControl';
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from '../../../components/StateViews';

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
    if (busy) return;
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
  if (!options) return <LoadingState label="Loading who you can message…" rows={4} />;

  const searchable = mode === 'person' || kind === 'group';
  const onlineCount = matches.filter((row) => row.online).length;

  const bar = (
    <AppHeader
      title="New conversation"
      eyebrow="Messages"
      back
      subtitle={
        mode === 'person'
          ? `${countNoun(matches.length, 'reachable person', 'reachable people')} · ${onlineCount} online`
          : 'Only people TRACK lets this account write to are listed.'
      }
    />
  );

  return (
    <Screen header={bar} animationKey={mode}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {formError ? <ErrorBanner message={formError} /> : null}

        {options.can_create_group ? (
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              { label: 'A person', value: 'person' },
              { label: 'A group', value: 'group' },
            ]}
          />
        ) : null}

        {searchable ? (
          <SearchField
            value={term}
            onChange={setTerm}
            testID="new-conversation-search"
            placeholder={mode === 'person' ? 'Name, username or class' : 'Filter the people listed below'}
          />
        ) : null}

        {mode === 'person' ? (
          matches.length === 0 ? (
            <EmptyState
              inline
              icon="person-outline"
              title="No reachable person by that name"
              body="Try part of a name instead."
            />
          ) : (
            <Card padded={false}>
              {matches.map((row, index) => (
                <ListRow
                  key={row.id}
                  divider={index > 0}
                  avatar={row.full_name}
                  hue={row.online ? colors.green : colors.navy}
                  title={row.full_name}
                  subtitle={row.detail ? `${row.role} · ${row.detail}` : row.role}
                  trailing={row.online ? <Badge label="Online" tone="green" glyph={false} /> : null}
                  onPress={() => create(() => messaging.createDirect(row.id))}
                />
              ))}
            </Card>
          )
        ) : (
          <View style={styles.form}>
            <Field
              label="Name"
              value={title}
              onChangeText={setTitle}
              placeholder="Chess club"
              inputProps={{ maxLength: 120 }}
              testID="new-conversation-name"
              hint="What readers see at the top of their inbox."
            />

            <View style={styles.block}>
              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.chips}>
                {kinds.map((row) => (
                  <Chip
                    key={row.id}
                    label={row.label}
                    selected={kind === row.id}
                    onPress={() => {
                      setKind(row.id);
                      setMemberIds([]);
                    }}
                  />
                ))}
              </View>
            </View>

            {kind === 'class' ? (
              <Dropdown
                label="Class"
                placeholder="Choose a class"
                value={sectionId}
                onChange={setSectionId}
                options={(options.sections || []).map((row) => ({ label: row.name, value: row.id }))}
              />
            ) : null}

            {kind === 'department' ? (
              <Dropdown
                label="Department"
                placeholder="Choose a department"
                value={departmentId}
                onChange={setDepartmentId}
                options={(options.departments || []).map((row) => ({ label: row.name, value: row.id }))}
              />
            ) : null}

            {kind === 'group' ? (
              <View style={styles.block}>
                <SectionHeader
                  title="First members"
                  detail={memberIds.length ? `${memberIds.length} selected` : 'Optional — anyone can be added later'}
                />
                {matches.length === 0 ? (
                  <Text style={styles.hint}>No reachable person by that name.</Text>
                ) : (
                  <Card padded={false}>
                    {matches.map((row, index) => (
                      <MemberToggle
                        key={row.id}
                        row={row}
                        index={index}
                        checked={memberIds.includes(row.id)}
                        onToggle={() =>
                          setMemberIds((current) =>
                            current.includes(row.id)
                              ? current.filter((id) => id !== row.id)
                              : [...current, row.id]
                          )
                        }
                      />
                    ))}
                  </Card>
                )}
              </View>
            ) : null}

            <Text style={styles.hint}>
              {kind === 'class'
                ? 'A class thread enrolls the section’s students, their parents and its teachers, and re-checks that roster every time it is opened.'
                : kind === 'department'
                  ? 'A department thread holds the administrators of that department.'
                  : 'Only people you may message can be added.'}
            </Text>

            <Button
              variant="primary"
              block
              loading={busy}
              disabled={blocked}
              onPress={() => create(submitGroup)}
              testID="new-conversation-submit"
            >
              Create conversation
            </Button>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

/** A checkbox row, because selecting five people is a yes/no per person. */
function MemberToggle({
  row,
  index,
  checked,
  onToggle,
}: {
  row: ContactRow;
  index: number;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.memberRow,
        index > 0 && styles.divider,
        pressed && styles.memberPressed,
        checked && styles.memberChecked,
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={`${checked ? 'Remove' : 'Add'} ${row.full_name}`}
    >
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
        {checked ? <Ionicons name="checkmark" size={14} color={colors.onNavy} /> : null}
      </View>
      <View style={styles.memberTexts}>
        <Text style={styles.memberName} numberOfLines={1}>
          {row.full_name}
        </Text>
        <Text style={styles.memberDetail} numberOfLines={1}>
          {row.role}
          {row.detail ? ` · ${row.detail}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  form: { gap: spacing.lg },
  block: { gap: spacing.sm },
  fieldLabel: { ...typography.label, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hint: { ...typography.subtle, color: colors.textSubtle },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: touch.target + 8,
  },
  memberPressed: { backgroundColor: colors.blueTint },
  memberChecked: { backgroundColor: colors.blueWash },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  memberTexts: { flex: 1, gap: 2 },
  memberName: { ...typography.body, color: colors.text, fontWeight: '700' },
  memberDetail: { ...typography.subtle },
});
