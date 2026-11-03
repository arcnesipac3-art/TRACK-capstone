/**
 * Messages — one thread.
 *
 * What a phone changes about a chat screen is not the protocol, it is the
 * geometry: there is no third column, so members and receipts live in the
 * header line and the receipt under each of my own messages, and the keyboard
 * takes room the web app never has to give up.
 *
 * The rules it keeps from the web client are the ones that make a live thread
 * trustworthy, so they are restated here rather than silently re-invented:
 *
 * - History pages, socket events and this device's own optimistic echo are
 *   merged by message identity (see ../../messaging/utils.ts), never appended.
 * - Opening the thread *is* the acknowledgement: it subscribes the live stream
 *   and sends the read marker, so the sender's receipt and the tab badge both
 *   settle here.
 * - A send carries a `client_reference` and goes over the socket when one is
 *   live, otherwise over HTTPS — the same write path, so a dropped connection
 *   delays a message instead of losing it. Never both.
 * - A failed row stays on screen so the reader can retry it; a retry reuses the
 *   same reference, and the server returns the stored row instead of a copy.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ScrollViewInstance,
} from 'react-native';

import { colors, radius, spacing, typography } from '../../../theme';
import { messaging } from '../../../api/messaging';
import type { ConversationDetail, MessageRow } from '../../../api/types';
import AppHeader from '../../../components/ui/AppHeader';
import Badge from '../../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import { getSessionUser } from '../../../session-user';
import { getMessagingSocket, setUnreadTotal, useMessagingEvents, useMessagingStatus } from '../../../messaging/bus';
import {
  clockTime,
  dayLabel,
  dedupeMessages,
  markFailed,
  messageGroups,
  newReference,
  receiptFor,
  sameDayAs,
  unreadSplit,
  upsertMessage,
} from '../../../messaging/utils';

const BODY_MAX = 4000;
/** Typing is advisory: with no follow-up frame the indicator has to expire. */
const TYPING_TTL_MS = 6000;

type TypingEntry = { name: string; at: number };

export default function MessageThreadScreen() {
  const params = useLocalSearchParams<{ id: string; unread?: string }>();
  const conversationId = Number(params.id);
  const me = getSessionUser();

  const [thread, setThread] = useState<ConversationDetail | null>(null);
  const [rows, setRows] = useState<MessageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState<Map<number, TypingEntry>>(new Map());
  const status = useMessagingStatus();

  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const stickToBottom = useRef(true);

  // A tap on a thread this tab already listed knows how much unread mail it
  // was, and that count is gone the moment the read marker is sent. The inbox
  // therefore hands it over as a route param; a deep link has none, and shows
  // no divider rather than a guessed one.
  const unreadMark = useMemo(() => {
    const known = Number(params.unread || 0);
    if (!known) return null;
    const newest = rows.filter((row) => Number.isFinite(row.seq ?? NaN)).slice(-1)[0];
    const seq = unreadSplit(known, newest?.seq ?? null);
    return seq ? { seq, count: known } : null;
  }, [params.unread, rows]);

  const loadThread = useCallback(async () => {
    if (!Number.isFinite(conversationId) || conversationId <= 0) {
      setError('That conversation does not exist.');
      return;
    }
    try {
      const [detail, page] = await Promise.all([
        messaging.conversation(conversationId),
        messaging.history(conversationId),
      ]);
      setThread(detail);
      // Merge, do not replace: a live message can arrive before history lands.
      setRows((current) => dedupeMessages([...page.messages, ...current]));
      setHasMore(page.has_more);
      setError(null);
      // The read marker settles the badge; publish the server's own total.
      const list = await messaging.conversations();
      setUnreadTotal(list.unread_total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open this conversation.');
    }
  }, [conversationId]);

  useEffect(() => {
    // `loadThread` sets state only after its awaits, and once for a bad id;
    // the rule traces the call, not the schedule. Same false positive as the
    // fees screens and the inbox.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadThread();
  }, [loadThread]);

  // Opening a thread is the acknowledgement. Registered even when the socket
  // is down: the client records the thread as open and subscribes it on resume.
  useEffect(() => {
    if (!Number.isFinite(conversationId) || conversationId <= 0) return;
    const socket = getMessagingSocket();
    socket?.subscribe(conversationId);
    socket?.markRead(conversationId);
    return () => {
      getMessagingSocket()?.unsubscribe(conversationId);
    };
  }, [conversationId]);

  /** Older pages; `before_seq` because a growing thread breaks offset paging. */
  const loadOlder = useCallback(async () => {
    const oldest = rows.find((row) => Number.isFinite(row.seq ?? NaN));
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await messaging.history(conversationId, { beforeSeq: oldest.seq as number });
      setRows((current) => dedupeMessages([...page.messages, ...current]));
      setHasMore(page.has_more);
      setHistoryError(null);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Could not load earlier messages.');
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, loadingOlder, rows]);

  useMessagingEvents(
    useCallback(
      (event) => {
        const socket = getMessagingSocket();
        const myId = me?.id;

        switch (event.event) {
          case 'message.new': {
            if (event.conversation_id !== conversationId || !event.message) return;
            setRows((current) => upsertMessage(current, event.message as MessageRow));
            // Being here is the acknowledgement of this row.
            socket?.markDelivered(conversationId, event.message.seq ?? undefined);
            socket?.markRead(conversationId, event.message.seq ?? undefined);
            if (typeof event.unread === 'number') setUnreadTotal(event.unread);
            break;
          }

          case 'inbox.message': {
            if (!event.message) return;
            if (event.conversation_id === conversationId) {
              setRows((current) => upsertMessage(current, event.message as MessageRow));
              socket?.markRead(conversationId, event.message.seq ?? undefined);
            }
            break;
          }

          case 'message.sent': {
            if (event.message) setRows((current) => upsertMessage(current, event.message as MessageRow));
            if (event.duplicate) setNotice('That message was already sent — it appears once.');
            break;
          }

          case 'messages.sync': {
            if (event.conversation_id !== conversationId) return;
            setRows((current) =>
              (event.messages || []).reduce(
                (list, row) => upsertMessage(list, row),
                current
              )
            );
            break;
          }

          case 'typing.update': {
            if (event.conversation_id !== conversationId) return;
            const who = event.user_id;
            if (who == null || who === myId) return;
            setTyping((current) => {
              const next = new Map(current);
              if (event.is_typing) {
                next.set(who, { name: event.name || 'Someone', at: Date.now() });
              } else {
                next.delete(who);
              }
              return next;
            });
            break;
          }

          case 'message.read':
          case 'conversation.read': {
            const who = (event.user_id ?? event.by_user_id) as number | undefined;
            if (event.conversation_id !== conversationId || who == null) return;
            setThread((current) =>
              current
                ? {
                    ...current,
                    members: current.members.map((member) =>
                      member.user_id === who
                        ? { ...member, last_read_seq: Math.max(member.last_read_seq ?? 0, event.seq ?? 0) }
                        : member
                    ),
                  }
                : current
            );
            if (typeof event.unread === 'number') setUnreadTotal(event.unread);
            break;
          }

          case 'message.delivered': {
            const who = event.user_id;
            if (event.conversation_id !== conversationId || who == null) return;
            setThread((current) =>
              current
                ? {
                    ...current,
                    members: current.members.map((member) =>
                      member.user_id === who
                        ? {
                            ...member,
                            last_delivered_seq: Math.max(
                              member.last_delivered_seq ?? 0,
                              event.seq ?? 0
                            ),
                          }
                        : member
                    ),
                  }
                : current
            );
            break;
          }

          case 'member.joined':
          case 'member.left': {
            if (event.conversation_id === conversationId) messaging.conversation(conversationId).then(setThread).catch(() => {});
            break;
          }

          case 'conversation.updated': {
            if (event.conversation_id === conversationId) messaging.conversation(conversationId).then(setThread).catch(() => {});
            break;
          }

          case 'error': {
            if (event.request_id) {
              setRows((current) => markFailed(current, String(event.request_id)));
            }
            setNotice(typeof event.message_text === 'string' ? event.message_text : 'That did not go through.');
            break;
          }

          default:
            break;
        }
      },
      [conversationId, me?.id]
    )
  );

  // The indicator has to expire: a person who stops typing mid-sentence sends
  // one last frame at most, and nothing else clears the line.
  useEffect(() => {
    if (typing.size === 0) return undefined;
    const timer = setInterval(() => {
      setTyping((current) => {
        if (current.size === 0) return current;
        const cutoff = Date.now() - TYPING_TTL_MS;
        const next = new Map([...current].filter(([, entry]) => entry.at > cutoff));
        return next.size === current.size ? current : next;
      });
    }, 1500);
    return () => clearInterval(timer);
  }, [typing.size]);

  function deliver(body: string, reference: string) {
    const socket = getMessagingSocket();
    if (socket?.postMessage(conversationId, body, { clientReference: reference, requestId: reference })) {
      return;
    }
    messaging
      .send(conversationId, body, reference)
      .then((data) => setRows((current) => upsertMessage(current, data.message)))
      .catch((err) => {
        setRows((current) => markFailed(current, reference));
        setNotice(err instanceof Error ? err.message : 'That message did not go through.');
      });
  }

  function send() {
    const body = draft.trim();
    if (!body || !thread || !me) return;
    const reference = newReference();
    setRows((current) =>
      upsertMessage(current, {
        id: null,
        conversation: conversationId,
        seq: null,
        sender: me.id,
        sender_name: me.full_name,
        sender_role: me.role,
        body,
        client_reference: reference,
        created_at: new Date().toISOString(),
        pending: true,
      })
    );
    setDraft('');
    setNotice(null);
    deliver(body, reference);
    getMessagingSocket()?.typing(conversationId, false);
  }

  function retry(row: MessageRow) {
    if (!row.client_reference) return;
    setRows((current) =>
      current.map((item) =>
        item.client_reference === row.client_reference
          ? { ...item, pending: true, failed: false, seq: null }
          : item
      )
    );
    deliver(row.body, row.client_reference);
  }

  function onTypingChange(text: string) {
    setDraft(text);
    if (text.length > 0 && text.length % 20 !== 0) return;
    getMessagingSocket()?.typing(conversationId, text.length > 0);
  }

  const turns = messageGroups(rows);
  const audience = (thread?.members || []).filter((member) => member.user_id !== me?.id);
  const isDirect = thread?.kind === 'direct';
  const typingLabel = [...typing.values()].map((entry) => `${entry.name} is typing…`).join(' ');

  // Derived, not state: "loading" is "the detail fetch has not landed", and a
  // failed first fetch has to fall through to the error screen below.
  if (thread === null && !error) return <LoadingState label="Opening conversation…" />;

  if (error) {
    return (
      <View style={styles.screen}>
        <AppHeader title="Messages" />
        <ErrorState message={error} onRetry={loadThread} />
        <ComposerFallback />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppHeader
        title={thread?.display_name ?? 'Conversation'}
        eyebrow={thread ? `${thread.kind_label}${audience.length > 1 ? ` · ${audience.length + 1} people` : ''}` : undefined}
        subtitle={
          thread
            ? typingLabel ||
              (status === 'live'
                ? audienceSummary(thread)
                : 'Offline — messages still send over the connection')
            : undefined
        }
        right={
          <TouchableOpacity style={styles.back} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back to conversations">
            <Text style={styles.backLabel}>Back</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.threadContent}
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          stickToBottom.current =
            contentOffset.y + layoutMeasurement.height >= contentSize.height - 120;
        }}
        onContentSizeChange={() => {
          if (stickToBottom.current) scrollRef.current?.scrollToEnd({ animated: false });
        }}
        refreshControl={
          hasMore ? (
            <RefreshControl refreshing={loadingOlder} onRefresh={loadOlder} colors={[colors.blue]} tintColor={colors.blue} />
          ) : undefined
        }
      >
        {historyError && (
          <TouchableOpacity onPress={loadOlder} accessibilityRole="button">
            <Text style={styles.errorText}>{historyError} Tap to try again.</Text>
          </TouchableOpacity>
        )}

        {rows.length === 0 ? (
          <EmptyState
            inline
            title="No messages yet"
            body={thread?.can_post ? 'Say the first thing below.' : 'This conversation is read-only.'}
          />
        ) : (
          turns.map((turn, index) => {
            const first = turn.rows[0];
            const previous = turns[index - 1]?.rows.slice(-1)[0];
            const dayChanged = !previous || !sameDayAs(first.created_at, previous.created_at);
            const mine = first.sender === me?.id;
            return (
              <View key={turn.key}>
                {dayChanged ? (
                  <Text style={styles.dayDivider}>{dayLabel(first.created_at)}</Text>
                ) : null}
                {unreadMark &&
                  !dayChanged &&
                  turn.rows.some((row) => row.seq === unreadMark.seq) ? (
                    <View style={styles.unreadDivider}>
                      <Text style={styles.unreadDividerText}>
                        {unreadMark.count} new message{unreadMark.count === 1 ? '' : 's'}
                      </Text>
                    </View>
                  ) : null}

                <View style={[styles.turn, mine && styles.turnMine]}>
                  {!mine && (
                    <Text style={styles.turnAuthor} numberOfLines={1}>
                      {first.sender_name}
                      {first.sender_role ? ` · ${first.sender_role}` : ''}
                    </Text>
                  )}
                  {turn.rows.map((row) => {
                    const receipt = mine ? receiptFor(row, { audience, isDirect }) : null;
                    return (
                      <View key={String(row.client_reference ?? row.id ?? row.seq)} style={styles.bubbleWrap}>
                        <TouchableOpacity
                          disabled={!row.failed}
                          onPress={() => retry(row)}
                          activeOpacity={0.8}
                          accessibilityRole={row.failed ? 'button' : undefined}
                          accessibilityLabel={row.failed ? `Retry: ${row.body}` : undefined}
                        >
                          <Text style={[styles.bubble, mine && styles.bubbleMine, row.failed && styles.bubbleFailed]}>
                            {row.body}
                          </Text>
                        </TouchableOpacity>
                        <View style={styles.metaRow}>
                          <Text style={styles.metaTime}>{clockTime(row.created_at)}</Text>
                          {receipt ? (
                            <Text style={[styles.receipt, row.failed && styles.receiptFailed]}>
                              {receipt.label}
                              {row.failed ? ' — tap to retry' : ''}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                  <Text style={styles.turnTime}>{clockTime(turn.rows[turn.rows.length - 1].created_at)}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {thread && !thread.can_post ? (
        <View style={styles.readOnly}>
          <Badge label={thread.is_archived ? 'Archived' : 'Read only'} tone="gray" glyph={false} />
          <Text style={styles.readOnlyText}>
            {thread.is_archived
              ? 'This conversation is archived. An administrator can reopen it.'
              : 'You cannot post in this conversation.'}
          </Text>
        </View>
      ) : (
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={onTypingChange}
            placeholder="Write a message"
            placeholderTextColor={colors.textSubtle}
            style={styles.input}
            multiline
            maxLength={BODY_MAX}
            accessibilityLabel="Message"
            onSubmitEditing={send}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.send, !draft.trim() && styles.sendDisabled]}
            onPress={send}
            disabled={!draft.trim()}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Text style={styles.sendLabel}>Send</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/** Rendered when the thread itself would not load, so Back is never lost. */
function ComposerFallback() {
  return null;
}

function audienceSummary(thread: ConversationDetail): string {
  const others = thread.members.filter((member) => member.role !== 'owner');
  if (thread.kind === 'direct') {
    const other = others[0];
    return other ? `${other.user_role} · ${other.online ? 'online' : 'offline'}` : 'Direct';
  }
  const online = thread.members.filter((member) => member.online).length;
  return `${thread.members.length} people · ${online} online`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  threadContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  back: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backLabel: { ...typography.label, color: colors.blue },
  dayDivider: { ...typography.label, textAlign: 'center', marginTop: spacing.sm },
  unreadDivider: {
    alignSelf: 'center',
    backgroundColor: colors.blueTint,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  unreadDividerText: { ...typography.subtle, fontWeight: '700', color: colors.blueText },
  turn: { maxWidth: '86%', gap: 3 },
  turnMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  turnAuthor: { ...typography.label },
  turnTime: { ...typography.subtle, alignSelf: 'flex-start' },
  bubbleWrap: { gap: 2 },
  bubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 1,
    ...typography.body,
    color: colors.text,
  },
  bubbleMine: { backgroundColor: colors.blue, borderColor: colors.blue, color: colors.onNavy },
  bubbleFailed: { backgroundColor: colors.redTint, borderColor: colors.redText },
  metaRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  metaTime: { ...typography.subtle },
  receipt: { ...typography.subtle },
  receiptFailed: { color: colors.redText },
  errorText: { ...typography.muted, color: colors.redText },
  notice: { ...typography.muted, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, color: colors.amberText },
  readOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  readOnlyText: { ...typography.muted, flex: 1 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  send: {
    backgroundColor: colors.blue,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sendDisabled: { backgroundColor: colors.borderStrong },
  sendLabel: { ...typography.buttonText, color: colors.onNavy, fontSize: 14 },
});
