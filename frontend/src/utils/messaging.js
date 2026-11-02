/**
 * TRACK — helpers shared by the messaging screens.
 *
 * The one that matters is `upsertMessage`: a thread receives rows from three
 * places (the REST history page, the socket, and this tab's own optimistic
 * echo), and the same message can reach all three. Identity is `id`, then
 * `client_reference`, then `seq` — in that order, because a pending row has a
 * reference but no id, and a resumed row has neither until the server answers.
 */

import { formatDate, formatRelative, formatTime } from './format'

function toDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Same day in the reader's own timezone. */
export function sameDayAs(left, right) {
  const a = toDate(left)
  const b = toDate(right)
  if (!a || !b) return false
  return a.toDateString() === b.toDateString()
}

/** "Today" · "Yesterday" · "Nov 12, 2026" — the divider above a day of messages. */
export function dayLabel(value) {
  const date = toDate(value)
  if (!date) return ''
  if (sameDayAs(date, new Date())) return 'Today'
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (sameDayAs(date, yesterday)) return 'Yesterday'
  return formatDate(date)
}

/** A conversation list shows a clock time for today and a relative day before that. */
export function listMoment(value) {
  const date = toDate(value)
  if (!date) return ''
  return sameDayAs(date, new Date()) ? formatTime(date) : formatRelative(date)
}

/**
 * Consecutive rows from one speaker inside this window read as one turn: the
 * name and avatar appear once and the clock time once, the way every chat app
 * the user already knows does it.
 */
export const TURN_WINDOW_MS = 2 * 60 * 1000

function timeApartMs(left, right) {
  const a = toDate(left)
  const b = toDate(right)
  if (!a || !b) return Number.POSITIVE_INFINITY
  return Math.abs(a.getTime() - b.getTime())
}

function isContinuation(previous, row) {
  if (!previous) return false
  // A pending row has no `seq` yet but the same author and a `created_at` of
  // now, so it joins the turn above it instead of starting a fresh one.
  return (
    previous.sender === row.sender &&
    sameDayAs(row.created_at, previous.created_at) &&
    timeApartMs(row.created_at, previous.created_at) <= TURN_WINDOW_MS
  )
}

/**
 * `messages` (oldest first) folded into turns.
 *
 * Grouping is by speaker, day and time — never by "is the row adjacent in the
 * array", because a resumed thread can interleave a late-arriving message from
 * someone else and two bubbles from different people must not share a name.
 */
export function messageGroups(messages) {
  const groups = []
  messages.forEach((row, index) => {
    const current = groups[groups.length - 1]
    const lastRow = current ? current.rows[current.rows.length - 1] : null
    if (isContinuation(lastRow, row)) {
      current.rows.push(row)
      return
    }
    groups.push({ key: row.client_reference || row.id || row.seq || `row-${index}`, rows: [row] })
  })
  return groups
}

/**
 * What this tab may claim about one of its own messages.
 *
 * The two markers per member (`last_read_seq`, `last_delivered_seq`) already
 * mean "everything up to that `seq`", so a receipt for any row is a comparison,
 * not a receipts table. A row with no `seq` has not been stored, so it has no
 * receipt to report, and a member with no delivery marker is simply not counted
 * as having received: guessing there would put a tick on a message the server
 * has not acknowledged.
 */
export function receiptFor(row, { audience, isDirect }) {
  if (row.pending) return { state: 'pending', label: 'Sending…' }
  if (row.failed) return { state: 'failed', label: 'Not delivered' }
  if (!Number.isFinite(row.seq) || !audience.length) return null

  const reached = (marker) => marker != null && marker >= row.seq
  const readers = audience.filter((member) => reached(member.last_read_seq)).length
  const holders = audience.filter((member) => reached(member.last_delivered_seq))
  const total = audience.length

  if (readers > 0) {
    return isDirect
      ? { state: 'read', label: 'Read' }
      : { state: 'read', label: `Read by ${readers} of ${total}` }
  }
  if (holders.length > 0) {
    return isDirect
      ? { state: 'delivered', label: 'Delivered' }
      : { state: 'delivered', label: `Delivered to ${holders.length} of ${total}` }
  }
  return { state: 'sent', label: 'Sent' }
}

/**
 * The `seq` the first unread message carries, or null.
 *
 * `unread` is the count the server reported for this member the moment the
 * thread was opened, and `lastSeq` the newest row of the page just loaded;
 * everything after that split is mail this tab has not shown the reader yet.
 * Opening the thread also sends the read marker, so this is the only point at
 * which the split can be known.
 */
export function unreadSplit(unread, lastSeq) {
  if (!unread || !Number.isFinite(lastSeq)) return null
  return Math.max(1, lastSeq - unread + 1)
}

/**
 * Whether two rows are the same message.
 *
 * A thread receives each message from up to three places — the REST history
 * page, the socket, and this tab's own optimistic echo — and the copy that
 * arrives before the server answers has a `client_reference` but no `id`. So
 * identity is matched field by field, in the order the rows gain them, not by
 * one key: the stored row must replace the pending twin, not sit next to it.
 */
function sameMessage(a, b) {
  if (a.id != null && b.id != null) return a.id === b.id
  if (a.client_reference && b.client_reference) {
    return a.client_reference === b.client_reference
  }
  if (Number.isFinite(a.seq) && a.seq === b.seq) {
    return a.conversation == null || b.conversation == null || a.conversation === b.conversation
  }
  return false
}

// A row that has not been stored yet has no `seq`, and belongs at the end.
function position(row) {
  return Number.isFinite(row.seq) ? row.seq : Number.MAX_SAFE_INTEGER
}

/**
 * Insert or replace one message in an ordered thread without duplicating it.
 * Returns the same array when nothing changed, so React can skip the re-render.
 */
export function upsertMessage(list, incoming) {
  if (!incoming) return list
  // A row this screen cannot name is a row it cannot place or merge.
  if (incoming.id == null && !incoming.client_reference && !Number.isFinite(incoming.seq)) {
    return list
  }
  const index = list.findIndex((row) => sameMessage(row, incoming))
  if (index === -1) {
    return [...list, incoming].sort((a, b) => position(a) - position(b))
  }
  // A stored row always wins over the optimistic one it replaces.
  if (list[index].pending && !incoming.pending) {
    return list.map((row, i) => (i === index ? { ...incoming } : row))
  }
  return list
}

/**
 * One copy of every message, oldest first, for any mix of history pages,
 * socket events and pending rows — the merge a thread does whenever the
 * server hands it a new page.
 */
export function dedupeMessages(rows) {
  const merged = []
  for (const row of rows) {
    const twin = merged.findIndex((existing) => sameMessage(existing, row))
    if (twin === -1) merged.push(row)
    else if (merged[twin].pending && !row.pending) merged[twin] = row
  }
  return merged.sort((a, b) => position(a) - position(b))
}

/** Remove one optimistic row (a send that failed and was not retried). */
export function dropMessage(list, reference) {
  return list.filter((row) => row.client_reference !== reference)
}

/** Mark a pending row as failed, keeping it visible so the user can retry. */
export function markFailed(list, reference) {
  return list.map((row) =>
    row.client_reference === reference ? { ...row, failed: true, pending: false } : row
  )
}

export const KIND_LABELS = {
  direct: 'Direct',
  group: 'Group',
  class: 'Class',
  department: 'Department',
}

/**
 * A stable id for one outbound message.
 *
 * `crypto.randomUUID()` is only exposed on secure origins, and TRACK is often
 * opened over plain http on a LAN address during a demo — so there is a
 * fallback. The server stores this as a UUID, so the fallback keeps the same
 * 8-4-4-4-12 shape; the reference only has to be unique per conversation.
 */
export function newReference() {
  const source = globalThis.crypto
  if (source?.randomUUID) return source.randomUUID()
  // 32 hex digits in 8-4-4-4-12 groups. The dash goes *beside* a digit, not in
  // place of one: the first cut of this fallback spent four of the 32 draws on
  // separators and produced a 28-digit string the server's UUID column refused —
  // which would have failed every send from a plain-http origin.
  const digit = () => {
    if (source?.getRandomValues) {
      const byte = source.getRandomValues(new Uint8Array(1))[0]
      return (byte % 16).toString(16)
    }
    return Math.floor(Math.random() * 16)
      .toString(16)
  }
  const groups = [8, 4, 4, 4, 12]
  const hex = Array.from({ length: 32 }, digit)
  // Version 4 and the RFC 4122 variant nibble, so this is indistinguishable
  // from randomUUID() output to anything that checks them.
  hex[12] = '4'
  hex[16] = (8 + (Number.parseInt(hex[16], 16) % 4)).toString(16)
  let cursor = 0
  return groups
    .map((size) => {
      const part = hex.slice(cursor, cursor + size).join('')
      cursor += size
      return part
    })
    .join('-')
}
