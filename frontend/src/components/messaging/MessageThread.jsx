import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../Button'
import EmptyState from '../EmptyState'
import ErrorMessage from '../ErrorMessage'
import Icon from '../Icon'
import { dayLabel, messageGroups, receiptFor, sameDayAs } from '../../utils/messaging'
import { formatTime, initials, roleLabel } from '../../utils/format'

const CONNECTION_LABEL = {
  live: { text: 'Live', tone: 'green' },
  connecting: { text: 'Connecting…', tone: 'amber' },
  reconnecting: { text: 'Reconnecting…', tone: 'amber' },
  offline: { text: 'Offline', tone: 'red' },
  closed: { text: 'Offline', tone: 'red' },
  'signed-out': { text: 'Signed out', tone: 'red' },
}

const CONNECTION_NOTE = {
  connecting: 'Connecting to TRACK…',
  reconnecting: 'Reconnecting — messages you send now go out the moment the line returns.',
  offline: 'Offline — new messages are held, not lost.',
  closed: 'Offline — reload the page to reconnect.',
  'signed-out': 'Signed out of the live connection.',
}

/** The server rejects a body over 4000 characters; the composer says so first. */
const BODY_LIMIT = 4000

const DRAFT_PREFIX = 'track.messages.draft.'

/**
 * An unsaved draft is the user's own words, so it survives a reload and a
 * switch to another thread. Private browsing and a full quota make this a
 * no-op — losing a draft on the way out is not worth an error banner.
 */
function readDraft(conversationId) {
  if (conversationId == null) return ''
  try {
    return window.localStorage.getItem(`${DRAFT_PREFIX}${conversationId}`) || ''
  } catch {
    return ''
  }
}

function writeDraft(conversationId, value) {
  if (conversationId == null) return
  try {
    if (value) window.localStorage.setItem(`${DRAFT_PREFIX}${conversationId}`, value)
    else window.localStorage.removeItem(`${DRAFT_PREFIX}${conversationId}`)
  } catch {
    /* not available in this browser */
  }
}

function newestSeq(rows) {
  return rows.reduce((top, row) => (Number.isFinite(row.seq) && row.seq > top ? row.seq : top), 0)
}

function rowKey(row) {
  return String(row.client_reference || row.id || row.seq)
}

/**
 * Middle column: the open thread, its history and the composer.
 *
 * Nothing here decides visibility — the rows came from
 * `/api/messaging/conversations/<id>/messages/`, which re-checks membership
 * for the authenticated user, and the socket only forwards a thread this
 * connection proved it belongs to.
 *
 * The reading experience follows what a chat app does with a scroll of
 * history: one avatar, name and clock per turn rather than per row; the tick
 * state of a message this user sent, from the members' own markers; the
 * reader's position kept under them when an older page is prepended; and a
 * way back to the newest message that says how much they skipped.
 */
export default function MessageThread({
  conversationId,
  thread,
  partner,
  messages,
  loading,
  error,
  hasMore,
  typingNames,
  presence,
  connection,
  myUserId,
  canPost,
  unreadMark = null,
  onBack,
  onShowDetails,
  onSend,
  onTyping,
  onRetry,
  onDismiss,
  onLoadOlder,
  onRetryHistory,
  onNew,
}) {
  const [draft, setDraft] = useState(() => readDraft(conversationId))
  const [pinned, setPinned] = useState(true)
  const [copied, setCopied] = useState(null)
  const composerRef = useRef(null)
  const scrollRef = useRef(null)
  // Stick to the newest message only while the reader is already at the
  // bottom; scrolling back through history must not be yanked forward.
  const pinnedRef = useRef(true)
  // The newest `seq` at the moment the reader scrolled away. Held in state
  // rather than a ref because the unseen count is drawn from it: a render must
  // not reach for a value an event handler may change without warning.
  const [leftAtSeq, setLeftAtSeq] = useState(null)
  // The box the list had when the reader left the bottom, so a page prepended
  // above the viewport can restore the place instead of losing it.
  const metrics = useRef({ height: 0, firstKey: null })

  const status = CONNECTION_LABEL[connection] || CONNECTION_LABEL.offline
  const isDirect = thread?.kind === 'direct'
  const partnerOnline = partner ? presence.has(partner.id) || partner.online : false
  const audience = useMemo(
    () => (thread?.members || []).filter((row) => row.user_id !== myUserId),
    [thread, myUserId]
  )
  const groups = useMemo(() => messageGroups(messages), [messages])
  const pending = messages.filter((row) => row.pending).length

  /**
   * The turn the unread mail starts at. The page fixes this the moment the
   * first history page lands, because opening a thread also sends the read
   * marker — after that the server no longer knows what was unread here.
   */
  const unreadIndex = useMemo(() => {
    if (!unreadMark) return -1
    return groups.findIndex((group) =>
      group.rows.some((row) => Number.isFinite(row.seq) && row.seq >= unreadMark.seq)
    )
  }, [groups, unreadMark])

  const unseen = pinned
    ? 0
    : messages.filter(
        (row) =>
          Number.isFinite(row.seq) &&
          row.sender !== myUserId &&
          row.seq > (leftAtSeq ?? newestSeq(messages))
      ).length

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const firstKey = messages.length ? rowKey(messages[0]) : null
    if (pinnedRef.current) {
      node.scrollTop = node.scrollHeight
    } else if (
      metrics.current.firstKey &&
      firstKey !== metrics.current.firstKey &&
      node.scrollHeight > metrics.current.height
    ) {
      // An earlier page was prepended above the viewport. Without this the
      // reader loses their place and reads the top of the new page instead.
      node.scrollTop += node.scrollHeight - metrics.current.height
    }
    metrics.current = { height: node.scrollHeight, firstKey }
  }, [messages])

  // A textarea that grows with the message, up to the point where it would eat
  // the thread; past that it scrolls like any other box.
  useEffect(() => {
    const node = composerRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(Math.max(node.scrollHeight, 42), 176)}px`
  }, [draft])

  // Opening a thread is done from the list, so the keyboard should already be
  // on the composer. On a phone that would raise the keyboard unasked, and the
  // back control is exactly what says this is a phone.
  useEffect(() => {
    if (!thread || onBack) return
    composerRef.current?.focus()
  }, [thread, onBack])

  useEffect(() => {
    writeDraft(conversationId, draft)
  }, [conversationId, draft])

  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(null), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  function handleScroll() {
    const node = scrollRef.current
    if (!node) return
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 80
    if (atBottom === pinnedRef.current) return
    pinnedRef.current = atBottom
    setLeftAtSeq(atBottom ? null : newestSeq(messages))
    setPinned(atBottom)
  }

  function jumpToLatest() {
    const node = scrollRef.current
    pinnedRef.current = true
    setLeftAtSeq(null)
    setPinned(true)
    if (node) node.scrollTop = node.scrollHeight
  }

  function submit(event) {
    event.preventDefault()
    const body = draft.trim()
    if (!body) return
    setDraft('')
    onSend(body)
  }

  function quote(row) {
    const quoted = row.body
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
    setDraft((current) => (current ? `${current}\n\n` : '') + quoted + '\n')
    composerRef.current?.focus()
  }

  async function copy(row, key) {
    try {
      await navigator.clipboard.writeText(row.body)
      setCopied(key)
    } catch {
      // Plain http hands out no clipboard. Saying "Copied" anyway would be a lie.
    }
  }

  if (!thread) {
    return (
      <section className="messaging-column thread-empty" aria-label="No conversation selected">
        <div className="empty-inner">
          <span className="empty-mark">
            <Icon name="chat" size={26} />
          </span>
          <h2 className="thread-title">Pick a conversation</h2>
          <p className="muted">
            Choose a thread on the left to read it here, or start a new one. Messages arrive the
            moment they are sent.
          </p>
          {onNew && (
            <Button variant="secondary" onClick={onNew}>
              <Icon name="plus" size={15} />
              <span className="btn-content">New conversation</span>
            </Button>
          )}
        </div>
      </section>
    )
  }

  const remaining = BODY_LIMIT - draft.trim().length

  return (
    <section className="messaging-column message-thread" aria-label="Conversation">
      <header className="thread-head">
        {onBack && (
          <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to conversations">
            <Icon name="arrowLeft" size={18} />
          </button>
        )}
        <div className="grow stack stack-xs">
          <div className="row">
            <h2 className="thread-title text-truncate">{thread.display_name || 'Conversation'}</h2>
            {!isDirect && (
              <span className="badge badge-neutral">
                {audience.length + 1} member{audience.length + 1 === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <p className="thread-meta" aria-live="polite">
            {typingNames.length > 0 ? (
              <span className="head-typing">
                {typingNames.slice(0, 2).join(', ')}
                {typingNames.length === 1 ? ' is typing' : ' are typing'}
                <span className="typing-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </span>
            ) : isDirect && partner ? (
              <>
                <span className={`status-dot${partnerOnline ? ' is-online' : ''}`} aria-hidden="true" />
                {partnerOnline ? 'Online now' : `${roleLabel(partner.role)} · offline`}
              </>
            ) : (
              `${thread.kind_label || ''}${thread.is_archived ? ' · archived' : ''}`
            )}
          </p>
        </div>
        <span className={`connection-chip tone-${status.tone}`}>{status.text}</span>
        {onShowDetails && (
          <button
            type="button"
            className="icon-btn"
            onClick={onShowDetails}
            aria-label="Show conversation details"
          >
            <Icon name="info" size={18} />
          </button>
        )}
      </header>

      {status.tone !== 'green' && (
        <p className={`thread-note tone-${status.tone}`}>
          {CONNECTION_NOTE[connection] || CONNECTION_NOTE.offline}
        </p>
      )}

      <div className="thread-scroll" ref={scrollRef} onScroll={handleScroll} role="log" tabIndex={-1}>
        {loading && messages.length === 0 && (
          <div className="history-skeleton" aria-hidden="true">
            <i className="skeleton-bubble" />
            <i className="skeleton-bubble is-mine" />
            <i className="skeleton-bubble" />
          </div>
        )}

        {!loading && error && (
          <div className="pad">
            <ErrorMessage error={error} title="Could not load this conversation" onRetry={onRetryHistory} />
          </div>
        )}

        {!loading && !error && messages.length === 0 && (
          <EmptyState
            icon="send"
            title="No messages yet"
            message="Say something — the other person sees it the moment you send it."
            className="pad"
          />
        )}

        {!error && hasMore && messages.length > 0 && (
          <p className="pad text-center">
            <Button size="xs" variant="ghost" loading={loading} onClick={onLoadOlder}>
              Load earlier messages
            </Button>
          </p>
        )}

        {groups.map((group, groupIndex) => {
          const previous = groups[groupIndex - 1]
          const first = group.rows[0]
          const mine = first.sender === myUserId
          const newDay = !previous || !sameDayAs(first.created_at, previous.rows[0].created_at)
          return (
            <div key={group.key} className={`bubble-group${mine ? ' is-mine' : ''}`}>
              {newDay && (
                <div className="day-divider">
                  <span>{dayLabel(first.created_at)}</span>
                </div>
              )}
              {groupIndex === unreadIndex && (
                <div className="day-divider is-unread">
                  <span>{unreadMark.count} new</span>
                </div>
              )}
              {group.rows.map((row, rowIndex) => {
                const isLast = rowIndex === group.rows.length - 1
                const key = rowKey(row)
                const receipt = mine && (isLast || row.pending || row.failed)
                  ? receiptFor(row, { audience, isDirect })
                  : null
                const name = !mine && rowIndex === 0 && !isDirect
                return (
                  <article
                    key={key}
                    className={[
                      'bubble-row',
                      mine && 'is-mine',
                      rowIndex === 0 && 'is-first',
                      isLast && 'is-last',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {!mine && (
                      <span className="avatar-slot" aria-hidden="true">
                        {rowIndex === 0 && <span className="avatar bubble-avatar">{initials(row.sender_name)}</span>}
                      </span>
                    )}
                    <div className="bubble-body">
                      {name && (
                        <p className="bubble-name">
                          {row.sender_name}
                          {row.sender_role ? ` · ${roleLabel(row.sender_role)}` : ''}
                        </p>
                      )}
                      <p className="bubble">{row.body}</p>
                      <span className={`bubble-meta${receipt ? ` has-receipt tone-${receipt.state}` : ''}`}>
                        <time className="bubble-time" dateTime={row.created_at}>
                          {formatTime(row.created_at)}
                        </time>
                        {receipt && (
                          <span className="receipt">
                            <Icon
                              name={
                                receipt.state === 'pending'
                                  ? 'clock'
                                  : receipt.state === 'failed'
                                    ? 'undo'
                                    : receipt.state === 'sent'
                                      ? 'check'
                                      : 'checkDouble'
                              }
                              size={13}
                            />
                            <span className="receipt-text">{receipt.label}</span>
                          </span>
                        )}
                        {row.failed && (
                          <span className="bubble-actions">
                            <Button size="xs" variant="secondary" onClick={() => onRetry(row)}>
                              Retry
                            </Button>
                            <Button size="xs" variant="ghost" onClick={() => onDismiss(row)}>
                              Remove
                            </Button>
                          </span>
                        )}
                      </span>
                    </div>
                    <span className="bubble-tools">
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => copy(row, key)}
                        aria-label={copied === key ? 'Message copied' : 'Copy message'}
                      >
                        <Icon name={copied === key ? 'check' : 'clipboard'} size={14} />
                      </button>
                      {canPost && (
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => quote(row)}
                          aria-label="Quote in a reply"
                        >
                          <Icon name="reply" size={14} />
                        </button>
                      )}
                    </span>
                  </article>
                )
              })}
            </div>
          )
        })}

        {!pinned && (
          <button type="button" className="jump-latest" onClick={jumpToLatest}>
            <Icon name="chevronDown" size={16} />
            <span>
              {unseen > 0
                ? `${unseen} new message${unseen === 1 ? '' : 's'}`
                : 'Jump to latest'}
            </span>
          </button>
        )}
      </div>

      {canPost ? (
        <form className="composer" onSubmit={submit}>
          <label className="visually-hidden" htmlFor="message-composer">
            Message
          </label>
          <textarea
            id="message-composer"
            ref={composerRef}
            className="textarea composer-input"
            rows={1}
            value={draft}
            maxLength={BODY_LIMIT}
            placeholder="Write a message…"
            onChange={(event) => {
              const value = event.target.value
              setDraft(value)
              onTyping(value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) submit(event)
            }}
          />
          <p className="composer-foot">
            {remaining <= 200 ? (
              <span className={remaining <= 20 ? 'composer-count is-tight' : 'composer-count'}>
                {remaining} characters left
              </span>
            ) : (
              <span className="composer-hint">Enter sends · Shift+Enter starts a new line</span>
            )}
            {pending > 0 && (
              <span className="composer-pending">
                {pending} message{pending === 1 ? '' : 's'} waiting to send
              </span>
            )}
          </p>
          <Button type="submit" className="composer-send" disabled={!draft.trim()} aria-label="Send message">
            <Icon name="send" size={16} />
            <span className="btn-content">Send</span>
          </Button>
        </form>
      ) : (
        <p className="composer-locked">
          {thread.is_archived
            ? 'This conversation is archived — no new messages.'
            : 'You cannot post in this conversation.'}
        </p>
      )}
    </section>
  )
}
