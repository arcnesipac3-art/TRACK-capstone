/**
 * TRACK — thread maths shared by the messaging screens.
 *
 * Ported from `frontend/src/utils/messaging.js` so both clients fold a live
 * thread the same way; the rules there are the ones that matter and they are
 * repeated here rather than re-derived:
 *
 * - A thread receives each message from up to three places (the REST history
 *   page, the socket, this device's own optimistic echo), so merging is by
 *   identity — `id`, then `client_reference`, then `seq`, in the order a row
 *   gains them — and never by array position.
 * - Consecutive rows fold into a turn by speaker, day and time, not by
 *   adjacency, because a resumed thread can interleave somebody else's late
 *   message between two of yours.
 * - A receipt is a comparison between the row's `seq` and one member's marker.
 *   A row with no `seq` has not been stored, so it has no receipt to report.
 */

import type { ConversationMemberRow, MessageRow } from '../api/types';
import { formatClock, formatDate, formatMonthDay } from '../format';

function toDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function sameDayAs(left?: string | null, right?: string | null): boolean {
  const a = toDate(left);
  const b = toDate(right);
  if (!a || !b) return false;
  return a.toDateString() === b.toDateString();
}

/** "Today" · "Yesterday" · "Nov 12, 2026" — the divider above a day of messages. */
export function dayLabel(value?: string | null): string {
  const date = toDate(value);
  if (!date) return '';
  if (sameDayAs(value, new Date().toISOString())) return 'Today';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDayAs(value, yesterday.toISOString())) return 'Yesterday';
  return formatDate(date);
}

/** A list row shows a clock time for today and a relative day before that. */
export function listMoment(value?: string | null): string {
  const date = toDate(value);
  if (!date) return '';
  return sameDayAs(value, new Date().toISOString()) ? formatClock(date) : formatMonthDay(date);
}

/** Clock time only — the stamp under one message in a turn. */
export function clockTime(value?: string | null): string {
  const date = toDate(value);
  return date === null ? '' : formatClock(date);
}

/** Consecutive rows from one speaker inside this window read as one turn. */
export const TURN_WINDOW_MS = 2 * 60 * 1000;

function timeApartMs(left?: string | null, right?: string | null): number {
  const a = toDate(left);
  const b = toDate(right);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.abs(a.getTime() - b.getTime());
}

function isContinuation(previous: MessageRow | null, row: MessageRow): boolean {
  if (!previous) return false;
  // A pending row has no `seq` yet but the same author and a `created_at` of
  // now, so it joins the turn above it instead of starting a fresh one.
  return (
    previous.sender === row.sender &&
    sameDayAs(row.created_at, previous.created_at) &&
    timeApartMs(row.created_at, previous.created_at) <= TURN_WINDOW_MS
  );
}

export type MessageTurn = { key: string; rows: MessageRow[] };

export function messageGroups(messages: readonly MessageRow[]): MessageTurn[] {
  const groups: MessageTurn[] = [];
  messages.forEach((row, index) => {
    const current = groups[groups.length - 1];
    const lastRow = current ? current.rows[current.rows.length - 1] : null;
    if (current && isContinuation(lastRow, row)) {
      current.rows.push(row);
      return;
    }
    groups.push({ key: String(row.client_reference ?? row.id ?? row.seq ?? `row-${index}`), rows: [row] });
  });
  return groups;
}

export type Receipt = { state: 'pending' | 'failed' | 'sent' | 'delivered' | 'read'; label: string };

/**
 * What this device may claim about one of its own messages.
 *
 * Both markers per member already mean "everything up to that `seq`", so a
 * receipt for any row is a comparison, not a receipts table. A member with no
 * delivery marker is not counted as having received: guessing there would put a
 * tick on a message the server has not acknowledged.
 */
export function receiptFor(
  row: MessageRow,
  { audience, isDirect }: { audience: ConversationMemberRow[]; isDirect: boolean }
): Receipt | null {
  if (row.pending) return { state: 'pending', label: 'Sending…' };
  if (row.failed) return { state: 'failed', label: 'Not delivered' };
  if (!Number.isFinite(row.seq ?? NaN) || !audience.length) return null;

  const seq = row.seq as number;
  const reached = (marker: number | null) => marker != null && marker >= seq;
  const readers = audience.filter((member) => reached(member.last_read_seq)).length;
  const holders = audience.filter((member) => reached(member.last_delivered_seq)).length;
  const total = audience.length;

  if (readers > 0) {
    return isDirect ? { state: 'read', label: 'Read' } : { state: 'read', label: `Read by ${readers} of ${total}` };
  }
  if (holders > 0) {
    return isDirect
      ? { state: 'delivered', label: 'Delivered' }
      : { state: 'delivered', label: `Delivered to ${holders} of ${total}` };
  }
  return { state: 'sent', label: 'Sent' };
}

/**
 * The `seq` the first unread message carries, or null.
 *
 * `unread` is the count the server reported for this member the moment the
 * thread was opened and `lastSeq` the newest row of the page just loaded, so
 * everything at or after this number is mail the reader has not seen yet.
 */
export function unreadSplit(unread: number | null, lastSeq: number | null): number | null {
  if (!unread || lastSeq == null || !Number.isFinite(lastSeq)) return null;
  return Math.max(1, lastSeq - unread + 1);
}

function sameMessage(a: MessageRow, b: MessageRow): boolean {
  if (a.id != null && b.id != null) return a.id === b.id;
  if (a.client_reference && b.client_reference) return a.client_reference === b.client_reference;
  if (Number.isFinite(a.seq) && a.seq === b.seq) {
    return a.conversation == null || b.conversation == null || a.conversation === b.conversation;
  }
  return false;
}

// A row that has not been stored yet has no `seq`, and belongs at the end.
function position(row: MessageRow): number {
  return Number.isFinite(row.seq ?? NaN) ? (row.seq as number) : Number.MAX_SAFE_INTEGER;
}

/** Insert or replace one message without duplicating it; same array if nothing changed. */
export function upsertMessage(list: MessageRow[], incoming: MessageRow): MessageRow[] {
  if (!incoming) return list;
  if (incoming.id == null && !incoming.client_reference && !Number.isFinite(incoming.seq ?? NaN)) {
    return list;
  }
  const index = list.findIndex((row) => sameMessage(row, incoming));
  if (index === -1) {
    return [...list, incoming].sort((a, b) => position(a) - position(b));
  }
  // A stored row always wins over the optimistic one it replaces.
  if (list[index].pending && !incoming.pending) {
    return list.map((row, i) => (i === index ? { ...incoming } : row));
  }
  return list;
}

/** One copy of every message, oldest first, for any mix of sources. */
export function dedupeMessages(rows: MessageRow[]): MessageRow[] {
  const merged: MessageRow[] = [];
  for (const row of rows) {
    const twin = merged.findIndex((existing) => sameMessage(existing, row));
    if (twin === -1) merged.push(row);
    else if (merged[twin].pending && !row.pending) merged[twin] = row;
  }
  return merged.sort((a, b) => position(a) - position(b));
}

/** Mark a pending row as failed, keeping it visible so the user can retry it. */
export function markFailed(list: MessageRow[], reference: string): MessageRow[] {
  return list.map((row) =>
    row.client_reference === reference ? { ...row, failed: true, pending: false } : row
  );
}

export const KIND_LABELS: Record<string, string> = {
  direct: 'Direct',
  group: 'Group',
  class: 'Class',
  department: 'Department',
};

/**
 * A stable id for one outbound message.
 *
 * The server stores this in a UUID column, so the shape has to be a real v4 —
 * 8-4-4-4-12 with the version and variant nibbles in place. React Native has no
 * `crypto.randomUUID`, and this value is not a credential: it only has to be
 * unique per conversation so a retry after a dropped socket returns the stored
 * row instead of a second copy.
 */
export function newReference(): string {
  const digit = () => Math.floor(Math.random() * 16).toString(16);
  const hex = Array.from({ length: 32 }, digit);
  hex[12] = '4';
  hex[16] = (8 + (Number.parseInt(hex[16], 16) % 4)).toString(16);
  const groups = [8, 4, 4, 4, 12];
  let cursor = 0;
  return groups
    .map((size) => {
      const part = hex.slice(cursor, cursor + size).join('');
      cursor += size;
      return part;
    })
    .join('-');
}
