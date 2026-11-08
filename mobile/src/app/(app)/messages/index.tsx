/**
 * Messages — the inbox.
 *
 * The server owns this list: every row comes from `GET /api/messaging/conversations/`
 * (backend/core/messaging_views.py), including who the reader may see at all, so
 * there is no role branch here and no client-side permission filter to get wrong.
 *
 * Live events patch the last fetched page rather than rebuilding it, and the
 * patch is thrown away on the next fetch — that ordering is what stops a count
 * the server already settled from being re-added by an event that arrived late.
 *
 * What a phone adds is the shape of the list itself. A thread row answers three
 * questions in one glance — who, what arrived, and does it still need me — so the
 * face goes on the left, the last message takes the width, and the time and the
 * unread count share the right edge. Unread gets a wash and a bold name because a
 * chat list is sorted by arrival, not by importance: the only way to see which
 * rows are new is to make them look different.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../../../theme';
import { hapticImpact } from '../../../haptics';
import { messaging } from '../../../api/messaging';
import type { ConversationSummaryRow } from '../../../api/types';
import AppHeader from '../../../components/ui/AppHeader';
import Avatar from '../../../components/ui/Avatar';
import Card from '../../../components/ui/Card';
import Fab from '../../../components/ui/Fab';
import Screen from '../../../components/ui/Screen';
import SearchField from '../../../components/ui/SearchField';
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from '../../../components/StateViews';
import { getSessionUser } from '../../../session-user';
import { setUnreadTotal, useMessagingEvents, useMessagingStatus } from '../../../messaging/bus';
import ConnectionPill from '../../../messaging/ConnectionPill';
import { listMoment } from '../../../messaging/utils';

type Patch = Partial<ConversationSummaryRow>;

export default function MessagesInboxScreen() {
  const [rows, setRows] = useState<ConversationSummaryRow[] | null>(null);
  const [patches, setPatches] = useState<Map<number, Patch>>(new Map());
  const [hoisted, setHoisted] = useState<number[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const status = useMessagingStatus();

  // The event handler outlives the render that created it; it must read the
  // list as it is now, not as it was when the socket first attached.
  const rowsRef = useRef<ConversationSummaryRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows ?? [];
  }, [rows]);

  const load = useCallback(
    async ({ quiet = false }: { quiet?: boolean } = {}) => {
      if (!quiet) setRefreshing(true);
      try {
        const page = await messaging.conversations(debounced);
        setRows(page.results);
        setPatches(new Map());
        setHoisted([]);
        setUnreadTotal(page.unread_total);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load your conversations.');
      } finally {
        setRefreshing(false);
      }
    },
    [debounced]
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    // The quiet path sets state only after its await; the rule traces the call
    // rather than the schedule, so a mount fetch reads as a cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load({ quiet: true });
  }, [load]);

  // Returning to this tab from a thread re-reads the list, so a thread the
  // reader just opened shows as read even if the socket missed the marker.
  // The first focus is skipped: the effect above already fetched this page.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      load({ quiet: true });
    }, [load])
  );

  useMessagingEvents(
    useCallback((event) => {
      const name = event.event;
      const conversationId = event.conversation_id;

      if (name === 'connected' || name === 'unread') {
        if (typeof event.unread === 'number') setUnreadTotal(event.unread);
        return;
      }
      if (name === 'conversation.added' || name === 'conversation.updated') {
        load({ quiet: true });
        return;
      }
      if (name !== 'inbox.message' && name !== 'message.new') return;

      const message = event.message;
      const base = rowsRef.current.find((row) => row.id === conversationId);
      // A thread this device has never listed — a group joined elsewhere, a new
      // direct conversation. The server owns the list, so ask it rather than
      // inventing a row from one event.
      if (!base) {
        load({ quiet: true });
        return;
      }

      const me = getSessionUser();
      const isMine = message?.sender != null && message.sender === me?.id;
      const incoming = name === 'inbox.message' && !isMine;

      setPatches((current) => {
        const next = new Map(current);
        const row = { ...base, ...(current.get(base.id) || {}) };
        next.set(base.id, {
          ...row,
          last_message: message ?? row.last_message,
          updated_at: message?.created_at ?? row.updated_at,
          unread_count: (row.unread_count ?? 0) + (incoming ? 1 : 0),
        });
        return next;
      });
      setHoisted((current) =>
        current[0] === base.id ? current : [base.id, ...current.filter((id) => id !== base.id)]
      );
      if (typeof event.unread === 'number') setUnreadTotal(event.unread);
    }, [load])
  );

  const visible = useMemo(() => {
    const merged = (rows ?? []).map((row) =>
      patches.has(row.id) ? ({ ...row, ...patches.get(row.id) } as ConversationSummaryRow) : row
    );
    const touched = hoisted
      .map((id) => merged.find((row) => row.id === id))
      .filter((row): row is ConversationSummaryRow => Boolean(row));
    return [...touched, ...merged.filter((row) => !hoisted.includes(row.id))];
  }, [rows, patches, hoisted]);

  // Derived, not state: "loading" is exactly "the first fetch has not landed",
  // and a failed first fetch must fall through to the inline error below.
  if (rows === null && !error) return <LoadingState label="Loading messages…" rows={5} />;

  const unreadThreads = visible.reduce((total, row) => total + (row.unread_count ?? 0), 0);

  const bar = (
    <AppHeader
      title="Messages"
      subtitle={
        unreadThreads > 0
          ? `${unreadThreads} unread across ${visible.length} ${visible.length === 1 ? 'thread' : 'threads'}`
          : `${visible.length} ${visible.length === 1 ? 'conversation' : 'conversations'}`
      }
      right={<ConnectionPill status={status} />}
    />
  );

  return (
    <Screen header={bar} animationKey={debounced}>
      <View style={styles.frame}>
        <View style={styles.search}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search conversations"
            testID="messages-search"
          />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load()}
              colors={[colors.blue]}
              tintColor={colors.blue}
            />
          }
        >
          {error ? <ErrorBanner message={error} onRetry={load} /> : null}

          {rows === null && error ? (
            <ErrorState message={error} onRetry={load} />
          ) : visible.length === 0 && !error ? (
            <EmptyState
              inline
              icon="chatbubbles-outline"
              title={debounced ? 'Nothing matches that' : 'No conversations yet'}
              body={
                debounced
                  ? 'Try part of a name instead.'
                  : 'Tap the compose button to write to someone the school lets you reach.'
              }
            />
          ) : visible.length > 0 ? (
            <Card padded={false}>
              {visible.map((row, index) => (
                <ConversationRow
                  key={String(row.id)}
                  row={row}
                  divider={index < visible.length - 1}
                />
              ))}
            </Card>
          ) : null}
        </ScrollView>

        <Fab
          floating
          icon="create"
          tone="brand"
          accessibilityLabel="Start a new conversation"
          testID="messages-new-fab"
          onPress={() => router.push('/messages/new')}
        />
      </View>
    </Screen>
  );
}

/**
 * Quiet when read, unmistakable when not: the wash and the weight carry the unread
 * state, so the count badge only has to say how many.
 */
function ConversationRow({ row, divider }: { row: ConversationSummaryRow; divider: boolean }) {
  const me = getSessionUser();
  const preview = row.last_message?.body ?? 'No messages yet';
  const mine = row.last_message?.sender != null && row.last_message?.sender === me?.id;
  const unread = row.unread_count ?? 0;
  const isDirect = row.kind === 'direct';
  const online = isDirect && row.partner?.online;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        divider && styles.divider,
        unread > 0 ? styles.rowUnread : null,
        pressed && styles.rowPressed,
      ]}
      onPress={() => {
        hapticImpact('light');
        // The count travels because it dies the moment the thread is opened: this
        // row is the only place that still knows where the unread began.
        router.push(
          unread > 0 ? `/messages/${row.id}?unread=${unread}` : `/messages/${row.id}`
        );
      }}
      accessibilityRole="button"
      accessibilityLabel={`${row.display_name}, ${preview}${unread ? `, ${unread} unread` : ''}`}
    >
      {isDirect ? (
        <View style={styles.face}>
          <Avatar name={row.display_name} size="md" />
          {online ? <View style={styles.onlineDot} /> : null}
        </View>
      ) : (
        <View style={styles.face}>
          <Avatar name={row.display_name} size="md" hue={colors.navy} />
        </View>
      )}

      <View style={styles.column}>
        <Text style={[styles.name, unread > 0 ? styles.nameUnread : null]} numberOfLines={1}>
          {row.display_name}
        </Text>
        <Text style={styles.preview} numberOfLines={1}>
          {mine && row.last_message ? `You: ${preview}` : preview}
        </Text>
        <View style={styles.tags}>
          {!isDirect ? <Text style={styles.tag}>{row.kind_label}</Text> : null}
          {row.is_archived ? <Text style={styles.tagArchived}>Archived</Text> : null}
        </View>
      </View>

      <View style={styles.right}>
        <Text style={styles.time}>{listMoment(row.updated_at)}</Text>
        {unread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, minHeight: 0 },
  search: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  content: { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxxl * 3, gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 72,
    backgroundColor: colors.surface,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  /** The unread wash is the same one a pressed row uses elsewhere, at half the weight. */
  rowUnread: { backgroundColor: colors.blueWash },
  rowPressed: { backgroundColor: colors.blueTint },
  face: { position: 'relative', flexShrink: 0 },
  onlineDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  column: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typography.subhead, color: colors.text },
  nameUnread: { ...typography.subhead, color: colors.navy, fontWeight: '800' },
  preview: { ...typography.caption, color: colors.textMuted },
  tags: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  tag: { ...typography.micro, color: colors.blueText },
  tagArchived: { ...typography.micro, color: colors.textSubtle },
  right: { alignItems: 'flex-end', gap: spacing.xs, flexShrink: 0 },
  time: { ...typography.subtle, color: colors.textSubtle },
  badge: {
    minWidth: 20,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: colors.navy,
  },
  badgeText: { ...typography.micro, color: colors.onNavy },
});
