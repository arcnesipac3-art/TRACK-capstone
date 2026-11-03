/**
 * TRACK — the messaging WebSocket client for the mobile app.
 *
 * The same design the web app uses (frontend/src/services/realtime.js), with
 * the two changes a phone forces:
 *
 * 1. The handshake credential is still a single-use ticket, fetched over REST
 *    with the `Authorization: Token …` header. The backend would also accept a
 *    raw token in the query string for non-browser clients, but the ticket is
 *    better on a device too: sockets reconnect on flaky radio, and a value that
 *    is worthless after 30 seconds cannot outlive its usefulness in a log.
 * 2. The path comes from the ticket response (`websocket_path`), and the origin
 *    from `WS_ORIGIN`, because on a phone the ASGI process is not necessarily
 *    the same host:port the REST API is served from.
 *
 * It is deliberately not a source of truth. Everything it shows is also
 * reachable over REST, so a dropped socket costs a refresh, not a message —
 * which is the property that makes backgrounding on a phone survivable.
 *
 * Three rules carried over from the web client:
 * - Reconnection reconciles by `seq`: every open thread asks for exactly what
 *   arrived while the socket was dark.
 * - Every outbound message carries a `client_reference`, so a retry after a
 *   lost acknowledgement returns the stored row instead of a second copy.
 * - Sending falls back to HTTPS when the socket is not live; never both.
 */

import { WS_ORIGIN } from '../api/client';
import { messaging } from '../api/messaging';
import type { MessageRow, WsTicket } from '../api/types';

/** The server treats a presence row as stale after 90s; a quarter keeps markers fresh. */
export const HEARTBEAT_MS = 25000;

/** Growing pauses between reconnects; the last entry repeats. */
const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000, 16000, 30000];

export type SocketEvent = {
  event: string;
  conversation_id?: number;
  message?: MessageRow;
  messages?: MessageRow[];
  user_id?: number;
  seq?: number;
  name?: string;
  is_typing?: boolean;
  online?: boolean;
  unread?: number;
  duplicate?: boolean;
  request_id?: string;
  code?: string;
  message_text?: string;
} & Record<string, unknown>;

export type SocketStatus = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'signed-out' | 'closed';

type SocketOptions = {
  onEvent?: (event: SocketEvent) => void;
  onStatus?: (status: SocketStatus, unread?: number | null) => void;
  getTicket?: () => Promise<WsTicket>;
  open?: (url: string) => WebSocket;
  now?: () => number;
};

export function createMessagingSocket(options: SocketOptions = {}) {
  const {
    onEvent = () => {},
    onStatus = () => {},
    getTicket = () => messaging.wsTicket(),
    // Resolved lazily: react-native-web and a browser both expose a global
    // WebSocket, and React Native provides one on the JS runtime — but reading
    // it at module load would break a test runner that has neither.
    open = (url: string) => new globalThis.WebSocket(url),
    now = () => Date.now(),
  } = options;

  let socket: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let lastTypingAt = 0;
  let latestUnread: number | null = null;

  /** conversation id → highest `seq` this device has rendered. */
  const sequences = new Map<number, number>();

  const isLive = () => socket !== null && socket.readyState === globalThis.WebSocket.OPEN;

  function status(next: SocketStatus) {
    onStatus(next, latestUnread);
  }

  function bump(conversationId: number | null | undefined, seq: number | null | undefined) {
    if (conversationId == null || seq == null || !Number.isFinite(seq)) return;
    sequences.set(conversationId, Math.max(sequences.get(conversationId) || 0, seq));
  }

  function track(event: SocketEvent) {
    const id = event.conversation_id;
    if (id == null) return;
    if (event.event === 'subscribed') bump(id, event.seq);
    if (event.event === 'message.new' && event.message) bump(id, event.message.seq);
    if (event.event === 'messages.sync') {
      (event.messages || []).forEach((row) => bump(id, row.seq));
    }
  }

  function send(frame: Record<string, unknown>): boolean {
    if (!isLive() || !socket) return false;
    socket.send(JSON.stringify(frame));
    return true;
  }

  function clearTimers() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  /** After a resume, ask each open thread for whatever arrived while dark. */
  function resume() {
    sequences.forEach((_seq, conversationId) => {
      send({ action: 'subscribe', conversation_id: conversationId });
    });
    sequences.forEach((since, conversationId) => {
      send({ action: 'sync', conversation_id: conversationId, since_seq: since });
    });
  }

  function scheduleReconnect() {
    if (stopped || retryTimer) return;
    const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
    attempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  }

  async function connect() {
    if (stopped || isLive() || socket) return;
    status('connecting');

    let ticket: WsTicket;
    try {
      ticket = await getTicket();
    } catch (error) {
      // A revoked token will never come back; retrying it only drains battery.
      const status_code = (error as { status?: number })?.status;
      if (status_code === 401 || status_code === 403) {
        stopped = true;
        status('signed-out');
        return;
      }
      status('offline');
      scheduleReconnect();
      return;
    }
    if (stopped || !ticket?.ticket) return;

    const path = ticket.websocket_path || '/api/ws/messaging/';
    socket = open(`${WS_ORIGIN}${path}?ticket=${encodeURIComponent(ticket.ticket)}`);

    socket.onopen = () => {
      attempt = 0;
      status('live');
      heartbeatTimer = setInterval(() => send({ action: 'presence.ping' }), HEARTBEAT_MS);
      resume();
    };
    socket.onmessage = (event: MessageEvent) => {
      let parsed: SocketEvent;
      try {
        parsed = JSON.parse(String(event.data)) as SocketEvent;
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== 'object') return;
      if (typeof parsed.unread === 'number') latestUnread = parsed.unread;
      track(parsed);
      onEvent(parsed);
    };
    socket.onclose = () => {
      const wasStopping = stopped;
      clearTimers();
      socket = null;
      if (wasStopping) return;
      status('reconnecting');
      scheduleReconnect();
    };
    socket.onerror = () => {
      status('offline');
    };
  }

  return {
    start: connect,

    stop() {
      stopped = true;
      clearTimers();
      if (socket) {
        socket.onclose = null;
        socket.close();
        socket = null;
      }
      status('closed');
    },

    isLive,
    send,

    /** Join one thread's live events. Safe to repeat; the server de-duplicates. */
    subscribe(conversationId: number) {
      // Registered even before its first frame, so a reconnect knows this
      // thread was open and resumes it.
      if (!sequences.has(conversationId)) sequences.set(conversationId, 0);
      return send({ action: 'subscribe', conversation_id: conversationId });
    },

    unsubscribe(conversationId: number) {
      sequences.delete(conversationId);
      return send({ action: 'unsubscribe', conversation_id: conversationId });
    },

    newestSeq(conversationId: number): number | null {
      return sequences.get(conversationId) ?? null;
    },

    /**
     * Send over the socket when it is up. `false` means "not sent at all", so
     * the caller posts over HTTPS instead — never both, or the retry logic has
     * nothing to deduplicate against.
     */
    postMessage(
      conversationId: number,
      body: string,
      { clientReference, requestId }: { clientReference: string; requestId: string }
    ) {
      return send({
        action: 'send',
        conversation_id: conversationId,
        body,
        client_reference: clientReference,
        request_id: requestId,
      });
    },

    /** Advisory and rate-limited server-side; the same limit is applied here. */
    typing(conversationId: number, isTyping: boolean) {
      if (!isTyping) {
        lastTypingAt = 0;
        return send({ action: 'typing', conversation_id: conversationId, is_typing: false });
      }
      const moment = now();
      if (moment - lastTypingAt < 1000) return false;
      lastTypingAt = moment;
      return send({ action: 'typing', conversation_id: conversationId, is_typing: true });
    },

    markRead(conversationId: number, uptoSeq?: number) {
      return send({
        action: 'read',
        conversation_id: conversationId,
        ...(uptoSeq != null ? { upto_seq: uptoSeq } : {}),
      });
    },

    markDelivered(conversationId: number, uptoSeq?: number) {
      return send({
        action: 'delivered',
        conversation_id: conversationId,
        ...(uptoSeq != null ? { upto_seq: uptoSeq } : {}),
      });
    },
  };
}

export type MessagingSocket = ReturnType<typeof createMessagingSocket>;
