/**
 * TRACK — messaging endpoints.
 *
 * Thin wrappers over the shared client, one function per route the backend
 * exposes (backend/core/urls.py). They exist so a screen never types a URL
 * string twice and so the response shapes carry the types from `./types`.
 *
 * Nothing here decides who may see what. `get_conversation_for` on the server
 * proves membership for every thread-scoped call, and `/messaging/contacts/`
 * returns only the people this account is allowed to write to — a client-side
 * filter here would be a permission the server does not hold.
 */

import { api } from './client';
import type {
  ContactRow,
  ConversationDetail,
  ConversationListResponse,
  MessageHistoryPage,
  MessagingOptions,
  MessagingSummary,
  WsTicket,
} from './types';

export const HISTORY_LIMIT = 50;

export const messaging = {
  conversations: (search = '') =>
    api.get<ConversationListResponse>('/messaging/conversations/', {
      params: search ? { q: search } : undefined,
    }),

  conversation: (id: number) => api.get<ConversationDetail>(`/messaging/conversations/${id}/`),

  /**
   * One page of history. Paging is by `seq`, never by page number: a thread
   * that grows while it is being read makes offset paging skip or repeat rows.
   */
  history: (id: number, { beforeSeq, sinceSeq }: { beforeSeq?: number; sinceSeq?: number } = {}) =>
    api.get<MessageHistoryPage>(`/messaging/conversations/${id}/messages/`, {
      params: {
        limit: HISTORY_LIMIT,
        ...(beforeSeq != null ? { before_seq: beforeSeq } : {}),
        ...(sinceSeq != null ? { since_seq: sinceSeq } : {}),
      },
    }),

  /** Fallback transport when the socket is down — the same write path. */
  send: (id: number, body: string, clientReference: string) =>
    api.post<{ message: MessageHistoryPage['messages'][number]; duplicate: boolean }>(
      `/messaging/conversations/${id}/messages/`,
      { body, client_reference: clientReference }
    ),

  markRead: (id: number, uptoSeq?: number) =>
    api.post<{ unread_total: number }>(`/messaging/conversations/${id}/read/`, {
      ...(uptoSeq != null ? { upto_seq: uptoSeq } : {}),
    }),

  contacts: (search = '') =>
    api.get<ContactRow[]>('/messaging/contacts/', {
      params: search ? { q: search } : undefined,
    }),

  options: () => api.get<MessagingOptions>('/messaging/options/'),

  summary: () => api.get<MessagingSummary>('/messaging/summary/'),

  createDirect: (targetUserId: number) =>
    api.post<ConversationDetail>('/messaging/conversations/', {
      kind: 'direct',
      target_user_id: targetUserId,
    }),

  createGroup: (input: { kind: 'group' | 'class' | 'department'; title: string; section_id?: number; department_id?: number; member_ids?: number[] }) =>
    api.post<ConversationDetail>('/messaging/conversations/', input),

  /** The single-use handshake credential; the long-lived token never enters a URL. */
  wsTicket: () => api.post<WsTicket>('/messaging/ws-ticket/'),
};
