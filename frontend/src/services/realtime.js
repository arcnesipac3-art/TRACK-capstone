/**
 * TRACK — the messaging WebSocket client.
 *
 * One socket per signed-in browser tab, used for live events and as a second
 * transport for sending. It is deliberately not a source of truth: everything
 * it shows is also reachable over REST, so a dropped socket costs a user a
 * refresh, not a message.
 *
 * Three rules shape the design:
 *
 * 1. The credential is a single-use ticket, never the API token. The token in
 *    a URL survives in proxy logs and browser history; the ticket is worthless
 *    after 30 seconds or one use (`POST /api/messaging/ws-ticket/`).
 * 2. Reconnection reconciles by `seq`, not by re-reading. Every thread tracks
 *    the highest message number it rendered, and the resume asks for exactly
 *    what arrived after that.
 * 3. Every sent message carries a `client_reference`. If the socket dies
 *    between "the server stored it" and "the acknowledgement reached me", the
 *    retry with the same reference returns the stored row instead of a second
 *    copy — the server enforces that, the client just has to keep the
 *    reference stable across attempts.
 */

import api, { API_BASE } from './api'

// The server treats a presence row as stale after 90 seconds; a quarter of
// that keeps a thread marked "being read" — which is what suppresses push and
// in-app notifications for it.
export const HEARTBEAT_MS = 25000

// Growing pauses between reconnects. The last entry repeats, so a long outage
// settles into a poll rather than a storm.
const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000, 16000, 30000]

/** `ws(s)://host/api/ws/messaging/` from the same base the REST client uses. */
export function socketUrl() {
  const origin =
    /^https?:\/\//i.test(API_BASE) || typeof window === 'undefined'
      ? API_BASE
      : `${window.location.protocol}//${window.location.host}${API_BASE}`
  const http = `${origin.replace(/\/+$/, '')}/ws/messaging/`
  return http.replace(/^http/i, 'ws')
}

export default function createMessagingSocket(options = {}) {
  const {
    onEvent = () => {},
    onStatus = () => {},
    getTicket = () => api.post('/messaging/ws-ticket/'),
    open = (url) => new WebSocket(url),
    now = () => Date.now(),
  } = options

  let socket = null
  let stopped = false
  let attempt = 0
  let retryTimer = null
  let heartbeatTimer = null
  let lastTypingAt = 0

  // conversation id → highest `seq` this tab has rendered.
  const sequences = new Map()

  const isLive = () => socket !== null && socket.readyState === WebSocket.OPEN

  function status(next) {
    onStatus(next)
  }

  function track(event) {
    const id = event.conversation_id
    if (id == null) return
    if (event.event === 'subscribed' && Number.isFinite(event.seq)) {
      bump(id, event.seq)
    }
    if (event.event === 'message.new' && event.message) {
      bump(id, event.message.seq)
    }
    if (event.event === 'messages.sync') {
      event.messages?.forEach((row) => bump(id, row.seq))
    }
  }

  function bump(conversationId, seq) {
    if (!Number.isFinite(seq)) return
    sequences.set(conversationId, Math.max(sequences.get(conversationId) || 0, seq))
  }

  function send(frame) {
    if (!isLive()) return false
    socket.send(JSON.stringify(frame))
    return true
  }

  function clearTimers() {
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }

  /** After a resume, ask each open thread for whatever arrived while dark. */
  function resume() {
    sequences.forEach((_seq, conversationId) => {
      send({ action: 'subscribe', conversation_id: conversationId })
    })
    sequences.forEach((since, conversationId) => {
      send({ action: 'sync', conversation_id: conversationId, since_seq: since })
    })
  }

  function scheduleReconnect() {
    if (stopped || retryTimer) return
    const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)]
    attempt += 1
    retryTimer = setTimeout(() => {
      retryTimer = null
      connect()
    }, delay)
  }

  async function connect() {
    if (stopped || isLive() || socket) return
    status('connecting')
    let ticket
    try {
      const payload = await getTicket()
      ticket = payload?.ticket
    } catch (error) {
      // 401 means the session is gone; retrying a credential that will never
      // come back only wastes the user's battery.
      if (error?.status === 401 || error?.status === 403) {
        stopped = true
        status('signed-out')
        return
      }
      status('offline')
      scheduleReconnect()
      return
    }
    if (stopped) return

    socket = open(`${socketUrl()}?ticket=${encodeURIComponent(ticket)}`)
    socket.onopen = () => {
      attempt = 0
      status('live')
      heartbeatTimer = setInterval(() => send({ action: 'presence.ping' }), HEARTBEAT_MS)
      resume()
    }
    socket.onmessage = (message) => {
      let event
      try {
        event = JSON.parse(message.data)
      } catch {
        return
      }
      if (!event || typeof event !== 'object') return
      track(event)
      onEvent(event)
    }
    socket.onclose = () => {
      const wasStopping = stopped
      clearTimers()
      socket = null
      if (wasStopping) return
      status('reconnecting')
      scheduleReconnect()
    }
    socket.onerror = () => {
      status('offline')
    }
  }

  return {
    start: connect,
    stop() {
      stopped = true
      clearTimers()
      if (socket) {
        socket.onclose = null
        socket.close()
        socket = null
      }
      status('closed')
    },

    isLive,
    send,

    /** Join one thread's live events. Safe to repeat; the server de-duplicates. */
    subscribe(conversationId) {
      // Registered even before its first frame, so a reconnect knows this
      // thread was open and resumes it.
      if (!sequences.has(conversationId)) sequences.set(conversationId, 0)
      return send({ action: 'subscribe', conversation_id: conversationId })
    },

    unsubscribe(conversationId) {
      sequences.delete(conversationId)
      return send({ action: 'unsubscribe', conversation_id: conversationId })
    },

    /**
     * The highest `seq` this tab has seen for a thread, or null. The UI keeps
     * its unread split and receipt markers relative to this number.
     */
    newestSeq(conversationId) {
      return sequences.get(conversationId) ?? null
    },

    /**
     * Send over the socket when it is up. `false` means "not sent at all", so
     * the caller posts over HTTPS instead — never both, or the retry logic has
     * nothing to deduplicate against.
     */
    postMessage(conversationId, body, { clientReference, requestId } = {}) {
      return send({
        action: 'send',
        conversation_id: conversationId,
        body,
        client_reference: clientReference,
        request_id: requestId,
      })
    },

    /**
     * Typing is advisory and rate-limited server-side to one announcement per
     * second per connection; the same limit is applied here so a fast typist
     * does not fill the socket with frames the server will drop anyway.
     */
    typing(conversationId, isTyping) {
      if (!isTyping) {
        lastTypingAt = 0
        return send({ action: 'typing', conversation_id: conversationId, is_typing: false })
      }
      const moment = now()
      if (moment - lastTypingAt < 1000) return false
      lastTypingAt = moment
      return send({ action: 'typing', conversation_id: conversationId, is_typing: true })
    },

    markRead(conversationId, uptoSeq) {
      return send({ action: 'read', conversation_id: conversationId, upto_seq: uptoSeq })
    },

    markDelivered(conversationId, uptoSeq) {
      return send({ action: 'delivered', conversation_id: conversationId, upto_seq: uptoSeq })
    },
  }
}
