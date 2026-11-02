/**
 * The socket client's contract with the messaging page: a ticket for the
 * handshake, a reconnect that reconciles by `seq`, and a send that reports
 * honestly whether the frame left. REST covers the rest — see realtime.js.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import createMessagingSocket, { HEARTBEAT_MS, socketUrl } from './realtime'

class FakeSocket {
  constructor(url) {
    this.url = url
    this.frames = []
    this.readyState = WebSocket.OPEN
    this.closed = 0
  }

  send(text) {
    this.frames.push(JSON.parse(text))
  }

  close() {
    this.closed += 1
    this.readyState = WebSocket.CLOSED
  }

  /** The frames this connection was asked to put on the wire. */
  sent(action) {
    return this.frames.filter((frame) => frame.action === action)
  }

  open() {
    this.onopen?.()
  }

  emit(event) {
    this.onmessage?.({ data: JSON.stringify(event) })
  }

  drop() {
    this.readyState = WebSocket.CLOSED
    this.onclose?.()
  }
}

function harness() {
  const sockets = []
  const statuses = []
  const events = []
  const getTicket = vi.fn(async () => ({ ticket: 'single-use-ticket' }))
  const socket = createMessagingSocket({
    getTicket,
    open: (url) => {
      const created = new FakeSocket(url)
      sockets.push(created)
      return created
    },
    onStatus: (status) => statuses.push(status),
    onEvent: (event) => events.push(event),
  })
  return {
    socket,
    sockets,
    statuses,
    events,
    getTicket,
    latest: () => sockets[sockets.length - 1],
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

describe('socketUrl', () => {
  it('sits under the same /api base the REST client uses, as ws(s)', () => {
    const url = socketUrl()
    expect(url).toMatch(/^wss?:\/\//)
    expect(url.endsWith('/api/ws/messaging/')).toBe(true)
  })
})

describe('handshake', () => {
  it('opens with the single-use ticket, never with the stored token', async () => {
    sessionStorage.setItem('track.auth.token', 'secret-api-token')
    const { socket, getTicket, latest } = harness()

    await socket.start()
    expect(getTicket).toHaveBeenCalledTimes(1)

    const url = latest().url
    expect(url).toContain('ticket=single-use-ticket')
    expect(url).not.toContain('secret-api-token')
    expect(url).not.toContain('token=')
    sessionStorage.clear()
  })

  it('signs off instead of retrying when the session is gone', async () => {
    const { socket, statuses, getTicket } = harness()
    getTicket.mockRejectedValueOnce(Object.assign(new Error('Sign in again.'), { status: 401 }))

    await socket.start()
    expect(statuses).toContain('signed-out')

    // No reconnect loop for a credential that will never come back.
    await vi.advanceTimersByTimeAsync(120000)
    expect(getTicket).toHaveBeenCalledTimes(1)
  })

  it('retries with a fresh ticket after a network failure', async () => {
    const { socket, getTicket, latest } = harness()
    getTicket.mockRejectedValueOnce(Object.assign(new Error('Offline'), { status: 0 }))

    await socket.start()
    expect(latest()).toBeUndefined()

    await vi.advanceTimersByTimeAsync(500)
    expect(getTicket).toHaveBeenCalledTimes(2)
    expect(latest().url).toContain('ticket=single-use-ticket')
  })
})

describe('reconnect and resume', () => {
  it('re-joins each tracked thread and asks for what arrived while dark', async () => {
    const { socket, latest } = harness()
    await socket.start()
    latest().open()

    socket.subscribe(7)
    latest().emit({ event: 'subscribed', conversation_id: 7, seq: 10 })
    latest().emit({
      event: 'message.new',
      conversation_id: 7,
      message: { id: 11, seq: 11, body: 'hi' },
    })
    expect(socket.newestSeq(7)).toBe(11)

    latest().drop()
    await vi.advanceTimersByTimeAsync(500)
    const next = latest()
    next.open()

    expect(next.sent('subscribe')).toEqual([{ action: 'subscribe', conversation_id: 7 }])
    expect(next.sent('sync')).toEqual([{ action: 'sync', conversation_id: 7, since_seq: 11 }])
  })

  it('does not resume a thread the page left', async () => {
    const { socket, latest } = harness()
    await socket.start()
    latest().open()
    socket.subscribe(7)
    socket.unsubscribe(7)

    latest().drop()
    await vi.advanceTimersByTimeAsync(500)
    const next = latest()
    next.open()
    expect(next.sent('sync')).toEqual([])
  })

  it('backs off between attempts and resets once the socket is live', async () => {
    const { socket, sockets } = harness()
    await socket.start()
    sockets[0].open()

    sockets[0].drop()
    for (const delay of [500, 1000, 2000, 4000]) {
      const before = sockets.length
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(sockets.length).toBe(before)
      await vi.advanceTimersByTimeAsync(1)
      expect(sockets.length).toBe(before + 1)
      sockets[sockets.length - 1].drop()
    }

    // Still failing: the next pause is the long one.
    await vi.advanceTimersByTimeAsync(7999)
    expect(sockets.length).toBe(5)
    await vi.advanceTimersByTimeAsync(1)
    expect(sockets.length).toBe(6)

    // A successful open makes the next outage fast again.
    sockets[5].open()
    sockets[5].drop()
    await vi.advanceTimersByTimeAsync(500)
    expect(sockets.length).toBe(7)
  })

  it('stops reconnecting when the page unmounts', async () => {
    const { socket, getTicket, latest } = harness()
    await socket.start()
    latest().drop()
    socket.stop()

    await vi.advanceTimersByTimeAsync(60000)
    expect(getTicket).toHaveBeenCalledTimes(1)
  })

  it('pings presence often enough to hold the viewing marker alive', async () => {
    const { socket, latest } = harness()
    await socket.start()
    latest().open()

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS)
    expect(latest().sent('presence.ping')).toHaveLength(1)
  })
})

describe('frames the page sends', () => {
  it('reports false when there is no live socket, so the caller uses HTTPS', async () => {
    const { socket, latest } = harness()
    await socket.start()
    const first = latest()
    first.open()

    expect(socket.postMessage(7, 'hello', { clientReference: 'ref-1', requestId: 'ref-1' })).toBe(
      true
    )
    expect(first.sent('send')[0]).toEqual({
      action: 'send',
      conversation_id: 7,
      body: 'hello',
      client_reference: 'ref-1',
      request_id: 'ref-1',
    })

    first.drop()
    expect(socket.isLive()).toBe(false)
    expect(socket.postMessage(7, 'hello again', { clientReference: 'ref-2' })).toBe(false)
  })

  it('throttles repeated typing but always delivers the stop', async () => {
    const { socket, latest } = harness()
    await socket.start()
    const first = latest()
    first.open()

    expect(socket.typing(7, true)).toBe(true)
    expect(socket.typing(7, true)).toBe(false)
    expect(socket.typing(7, false)).toBe(true)
    expect(first.sent('typing').map((frame) => frame.is_typing)).toEqual([true, false])
  })

  it('marks read and delivered with the message number, not the id', async () => {
    const { socket, latest } = harness()
    await socket.start()
    const first = latest()
    first.open()

    socket.markRead(7, 12)
    socket.markDelivered(7, 12)
    expect(first.sent('read')[0]).toEqual({ action: 'read', conversation_id: 7, upto_seq: 12 })
    expect(first.sent('delivered')[0]).toEqual({
      action: 'delivered',
      conversation_id: 7,
      upto_seq: 12,
    })
  })
})

describe('events out to the page', () => {
  it('passes server events through and tracks the newest seq per thread', async () => {
    const { socket, events, latest } = harness()
    await socket.start()
    const first = latest()
    first.open()
    socket.subscribe(3)
    first.emit({ event: 'subscribed', conversation_id: 3, seq: 2 })

    first.emit({ event: 'message.new', conversation_id: 3, message: { seq: 4 } })
    first.emit({ event: 'typing.update', conversation_id: 3, user_id: 9, is_typing: true })
    first.emit({ event: 'presence', user_id: 9, online: true })

    expect(events.map((event) => event.event)).toEqual([
      'subscribed',
      'message.new',
      'typing.update',
      'presence',
    ])
    expect(socket.newestSeq(3)).toBe(4)
  })

  it('ignores a frame it cannot parse', async () => {
    const { socket, events, latest } = harness()
    await socket.start()
    const first = latest()
    first.open()

    expect(() => first.onmessage({ data: '{not json' })).not.toThrow()
    expect(() => first.onmessage({ data: '"a string"' })).not.toThrow()
    expect(events).toEqual([])
  })
})
