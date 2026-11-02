/**
 * The identity rules a thread depends on: the same message reaches the screen
 * from history, from the socket, and from this tab's own pending echo, and must
 * be drawn once. See utils/messaging.js.
 */
import { describe, expect, it } from 'vitest'
import {
  dayLabel,
  dedupeMessages,
  dropMessage,
  listMoment,
  markFailed,
  messageGroups,
  newReference,
  receiptFor,
  sameDayAs,
  unreadSplit,
  upsertMessage,
} from './messaging'

const stored = { id: 42, conversation: 7, seq: 14, sender: 5, body: 'Bring it to my room.' }
const pending = {
  conversation: 7,
  seq: null,
  sender: 5,
  body: 'Bring it to my room.',
  client_reference: 'ref-42',
  pending: true,
}

describe('upsertMessage', () => {
  it('replaces a pending row with the stored copy the server answered with', () => {
    const next = upsertMessage([pending], { ...stored, client_reference: 'ref-42' })

    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ id: 42, seq: 14 })
    expect(next[0].pending).toBeUndefined()
  })

  it('does not duplicate a live message the history page already carried', () => {
    const list = [stored]
    expect(upsertMessage(list, { ...stored })).toBe(list)
  })

  it('keeps an unread message from another member by its sequence number', () => {
    const theirs = { conversation: 7, seq: 15, sender: 9, body: 'Yes, ma’am.' }
    const next = upsertMessage([stored], theirs)

    expect(next.map((row) => row.seq)).toEqual([14, 15])
    // A resumed socket hands over the same row without an id: still one copy.
    expect(upsertMessage(next, { conversation: 7, seq: 15, sender: 9, body: 'Yes, ma’am.' })).toBe(
      next
    )
  })

  it('puts a pending row after everything the server has numbered', () => {
    const next = upsertMessage([stored], pending)
    expect(next.map((row) => row.seq)).toEqual([14, null])
  })

  it('ignores a row with no identity at all', () => {
    const list = [stored]
    expect(upsertMessage(list, { body: 'no keys' })).toBe(list)
    expect(upsertMessage(list, null)).toBe(list)
  })

  it('matches rows across conversations by more than their sequence number', () => {
    const otherThread = { id: null, conversation: 8, seq: 14, sender: 9, body: 'Different room.' }
    const next = upsertMessage([stored], otherThread)
    expect(next).toHaveLength(2)
  })
})

describe('dedupeMessages', () => {
  it('collapses the pending twin when an older page is merged in', () => {
    const older = [
      { id: 40, conversation: 7, seq: 12, sender: 5, body: 'Friday, before 3pm.' },
      { id: 41, conversation: 7, seq: 13, sender: 9, body: 'Can I see the sheet first?' },
    ]
    const merged = dedupeMessages([...older, { ...stored, client_reference: 'ref-42' }, pending])

    expect(merged.map((row) => row.seq)).toEqual([12, 13, 14])
    expect(merged[2].id).toBe(42)
  })

  it('orders by sequence and leaves unsent rows at the end', () => {
    const merged = dedupeMessages([pending, stored, { conversation: 7, seq: 13, sender: 9 }])
    expect(merged.map((row) => row.seq)).toEqual([13, 14, null])
  })
})

describe('markFailed and dropMessage', () => {
  it('keeps a failed send visible under the same reference', () => {
    const failed = markFailed([pending], 'ref-42')
    expect(failed[0]).toMatchObject({ failed: true, pending: false })
    // …and a retry reuses the reference, so the server can deduplicate it.
    expect(failed[0].client_reference).toBe('ref-42')
  })

  it('removes only that row', () => {
    const list = [stored, pending]
    expect(dropMessage(list, 'ref-42')).toEqual([stored])
  })
})

describe('date labels', () => {
  const today = new Date()
  const iso = (daysAgo, hours = 9) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo, hours).toISOString()

  it('groups a day of messages against the reader’s own date', () => {
    expect(sameDayAs(iso(0, 8), iso(0, 22))).toBe(true)
    expect(sameDayAs(iso(1), iso(0))).toBe(false)
  })

  it('names today and yesterday, and dates anything older', () => {
    expect(dayLabel(iso(0))).toBe('Today')
    expect(dayLabel(iso(1))).toBe('Yesterday')
    expect(dayLabel(iso(30))).toMatch(/\d{4}/)
    expect(dayLabel(null)).toBe('')
  })

  it('shows a clock time for today and a relative day before that', () => {
    expect(listMoment(iso(0))).toMatch(/\d{1,2}:\d{2}/)
    // Two whole days back: far enough that the clock cannot round it to a
    // neighbouring label whichever hour this test runs in.
    expect(listMoment(new Date(Date.now() - 2 * 86400000).toISOString())).toBe('2 days ago')
    expect(listMoment('not a date')).toBe('')
  })
})

describe('newReference', () => {
  const withoutRandomUUID = (run) => {
    // newReference reads globalThis.crypto when it is called, so stubbing here
    // exercises the fallback without re-importing the module.
    const original = globalThis.crypto
    try {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: { randomUUID: undefined },
      })
      return run()
    } finally {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: original })
    }
  }

  it('is a UUID the server will accept when crypto.randomUUID is absent', () => {
    // Plain-http origins (a demo on a LAN address) have no randomUUID, and the
    // server stores the reference in a UUID column and answers 400 otherwise —
    // a malformed fallback would fail every send from that origin.
    const reference = withoutRandomUUID(newReference)
    expect(reference).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(reference[14]).toBe('4')
    expect('89ab').toContain(reference[19])
  })

  it('stays unique across a burst of fallback references', () => {
    const seen = withoutRandomUUID(() => Array.from({ length: 200 }, newReference))
    expect(new Set(seen).size).toBe(200)
  })
})

describe('folding a thread into turns', () => {
  const row = (seq, sender, when = '2026-11-01T08:00:00Z', extra = {}) => ({
    id: seq,
    seq,
    sender,
    conversation: 7,
    created_at: when,
    ...extra,
  })

  it('keeps consecutive rows from one speaker in one turn', () => {
    const groups = messageGroups([row(1, 9), row(2, 9), row(3, 5)])
    expect(groups).toHaveLength(2)
    expect(groups[0].rows.map((r) => r.seq)).toEqual([1, 2])
    expect(groups[1].rows.map((r) => r.seq)).toEqual([3])
  })

  it('starts a new turn when the speaker changes and comes back', () => {
    const groups = messageGroups([row(1, 9), row(2, 5), row(3, 9)])
    expect(groups.map((group) => group.rows.length)).toEqual([1, 1, 1])
  })

  // Same clock time a day apart: local midnight moves with the machine's
  // timezone, so a fixed UTC boundary would not be a boundary everywhere.
  it('does not join rows a day apart', () => {
    const groups = messageGroups([
      row(1, 9, '2026-10-31T08:00:00Z'),
      row(2, 9, '2026-11-01T08:00:00Z'),
    ])
    expect(groups).toHaveLength(2)
  })

  it('does not join rows the speaker sent minutes apart', () => {
    const groups = messageGroups([
      row(1, 9, '2026-11-01T08:00:00Z'),
      row(2, 9, '2026-11-01T08:09:00Z'),
    ])
    expect(groups).toHaveLength(2)
  })

  it('gives a pending row the turn of the message it follows', () => {
    const groups = messageGroups([
      row(1, 5),
      row(2, 5, '2026-11-01T08:00:30Z', { seq: null, pending: true, client_reference: 'x' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].rows).toHaveLength(2)
  })
})

describe('the receipt line under my own message', () => {
  const mine = { seq: 12, sender: 5 }
  const one = (marker) => [{ user_id: 9, ...marker }]

  it('says sending while the row is not stored', () => {
    expect(receiptFor({ pending: true }, { audience: one({}), isDirect: true })).toEqual({
      state: 'pending',
      label: 'Sending…',
    })
  })

  it('says not delivered when the send failed', () => {
    expect(receiptFor({ failed: true }, { audience: one({}), isDirect: true }).state).toBe('failed')
  })

  it('says sent before the other side has anything', () => {
    expect(receiptFor(mine, { audience: one({ last_read_seq: 10 }), isDirect: true }).label).toBe('Sent')
  })

  it('says delivered once it reached the other device', () => {
    expect(
      receiptFor(mine, { audience: one({ last_delivered_seq: 12, last_read_seq: 10 }), isDirect: true }).label
    ).toBe('Delivered')
  })

  it('prefers read over delivered', () => {
    expect(
      receiptFor(mine, { audience: one({ last_delivered_seq: 12, last_read_seq: 12 }), isDirect: true }).label
    ).toBe('Read')
  })

  it('refuses to guess delivery from a read marker it cannot match', () => {
    // A member whose read marker sits below this row has acknowledged nothing
    // about it, and inventing a tick would report a delivery the server never
    // confirmed.
    expect(receiptFor({ seq: 13, sender: 5 }, { audience: one({ last_read_seq: 12 }), isDirect: true }).label).toBe(
      'Sent'
    )
  })

  it('counts the group rather than naming one person', () => {
    const many = [
      { user_id: 9, last_read_seq: 12 },
      { user_id: 10, last_delivered_seq: 12, last_read_seq: 4 },
    ]
    expect(receiptFor(mine, { audience: many, isDirect: false }).label).toBe('Read by 1 of 2')
    expect(receiptFor({ seq: 12, sender: 5 }, { audience: many.slice(1), isDirect: false }).label).toBe(
      'Delivered to 1 of 1'
    )
  })

  it('reports nothing for a row that cannot be measured yet', () => {
    expect(receiptFor({ seq: null }, { audience: one({ last_read_seq: 12 }), isDirect: true })).toBeNull()
    expect(receiptFor(mine, { audience: [], isDirect: true })).toBeNull()
  })
})

describe('where the unread mail starts', () => {
  it('splits the loaded page at the first message that was unread', () => {
    expect(unreadSplit(2, 12)).toBe(11)
  })

  it('is null when nothing was unread or the page has no rows', () => {
    expect(unreadSplit(0, 12)).toBeNull()
    expect(unreadSplit(2, null)).toBeNull()
  })

  it('never points before the first message when more mail is unread than loaded', () => {
    expect(unreadSplit(60, 12)).toBe(1)
  })
})
