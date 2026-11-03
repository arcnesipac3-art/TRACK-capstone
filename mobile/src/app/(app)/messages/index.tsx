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
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { colors, radius, spacing, typography } from '../../../theme';
import { messaging } from '../../../api/messaging';
import type { ConversationSummaryRow } from '../../../api/types';
import AppHeader from '../../../components/ui/AppHeader';
import Badge from '../../../components/ui/Badge';
import ScreenList from '../../../components/ScreenList';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import { getSessionUser } from '../../../session-user';
import { setUnreadTotal, useMessagingEvents, useMessagingStatus } from '../../../messaging/bus';
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
  if (rows === null && !error) return <LoadingState label="Loading messages…" />;

  const connectionLabel =
    status === 'live'
      ? 'Live'
      : status === 'signed-out'
        ? 'Signed out'
        : status === 'connecting'
          ? 'Connecting…'
          : 'Reconnecting — send still works';

  return (
    <View style={styles.screen}>
      <AppHeader
        title="Messages"
        subtitle={`${visible.length} conversation${visible.length === 1 ? '' : 's'} · ${connectionLabel}`}
        right={
          <TouchableOpacity
            style={styles.newButton}
            onPress={() => router.push('/messages/new')}
            accessibilityRole="button"
            accessibilityLabel="Start a new conversation"
          >
            <Text style={styles.newButtonLabel}>New</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.scroll}
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
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search conversations"
          placeholderTextColor={colors.textSubtle}
          style={styles.search}
          accessibilityLabel="Search conversations"
          autoCorrect={false}
          returnKeyType="search"
        />

        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        {visible.length === 0 ? (
          error ? (
            <ErrorState
              message={error}
              onRetry={load}
            />
          ) : (
            <EmptyState
              inline
              title={debounced ? 'Nothing matches that' : 'No conversations yet'}
              body={
                debounced
                  ? 'Try part of a name instead.'
                  : 'Tap New to write to someone the school lets you reach.'
              }
            />
          )
        ) : (
          <ScreenList
            data={visible}
            keyExtractor={(item) => String(item.id)}
            renderItem={(row) => <ConversationRow row={row} />}
          />
        )}
      </ScrollView>
    </View>
  );
}

function ConversationRow({ row }: { row: ConversationSummaryRow }) {
  const me = getSessionUser();
  const preview = row.last_message?.body ?? 'No messages yet';
  const mine = row.last_message?.sender != null && row.last_message?.sender === me?.id;
  const unread = row.unread_count ?? 0;

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={() => router.push(`/messages/${row.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${row.display_name}${unread ? `, ${unread} unread` : ''}`}
    >
      <View style={styles.rowTop}>
        <Text style={styles.rowName} numberOfLines={1}>
          {row.display_name}
        </Text>
        <Text style={styles.rowTime}>{listMoment(row.updated_at)}</Text>
      </View>

      <Text style={styles.rowPreview} numberOfLines={2}>
        {mine && row.last_message ? `You: ${preview}` : preview}
      </Text>

      <View style={styles.rowBottom}>
        {row.kind !== 'direct' ? (
          <Badge label={row.kind_label} tone="blue" glyph={false} />
        ) : row.partner?.online ? (
          <Badge label="Online" tone="green" glyph={false} />
        ) : null}
        {row.is_archived ? <Badge label="Archived" tone="gray" glyph={false} /> : null}
        {unread > 0 ? (
          <View style={styles.unread}>
            <Text style={styles.unreadText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  newButton: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newButtonLabel: { ...typography.label, color: colors.blue },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    ...typography.body,
    color: colors.text,
  },
  errorText: { ...typography.muted, color: colors.redText },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 3,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowName: { ...typography.heading, color: colors.navy, flexShrink: 1 },
  rowTime: { ...typography.subtle },
  rowPreview: { ...typography.muted },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  unread: {
    marginLeft: 'auto',
    backgroundColor: colors.blue,
    borderRadius: 999,
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
  },
  unreadText: { ...typography.subtle, fontWeight: '700', color: colors.onNavy },
});
