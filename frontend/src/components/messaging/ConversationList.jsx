import { useEffect, useRef, useState } from 'react'
import EmptyState from '../EmptyState'
import ErrorMessage from '../ErrorMessage'
import Icon from '../Icon'
import ListSkeleton from '../loading/ListSkeleton'
import Button from '../Button'
import { initials, roleLabel } from '../../utils/format'
import { listMoment } from '../../utils/messaging'

const STEP_KEYS = { ArrowDown: 1, ArrowUp: -1 }

/** `You: …` for a message this account sent — every chat list does it. */
function previewOf(row, myUserId) {
  if (!row.last_message) return `No messages yet · ${row.member_count} member${row.member_count === 1 ? '' : 's'}`
  const who = row.last_message.sender === myUserId ? 'You' : row.last_message.sender_name
  return `${who}: ${row.last_message.body}`
}

/**
 * Left column: every thread this account belongs to.
 *
 * The rows are the server's `/api/messaging/conversations/` payload as-is —
 * unread counts come from the member's own read marker, so nothing here
 * decides who may see what. The endpoint returns the whole list rather than a
 * page, which is what makes the Unread tab an honest filter instead of a
 * filter over whatever happens to be loaded.
 */
export default function ConversationList({
  rows,
  loading,
  error,
  query,
  onQuery,
  activeId,
  onSelect,
  onNew,
  onRetry,
  presence,
  unreadTotal,
  myUserId,
}) {
  const [scope, setScope] = useState('all')
  const searchRef = useRef(null)
  const listRef = useRef(null)

  const unread = rows.filter((row) => row.unread_count > 0)
  const visible = scope === 'unread' ? unread : rows

  // The list is long and the search is the fastest way through it, so the
  // shortcut the rest of the app's power users expect focuses it.
  useEffect(() => {
    function onKey(event) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      searchRef.current?.focus()
      searchRef.current?.select()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  /** Arrow keys walk the rows, so a thread can be reached without the mouse. */
  function moveFocus(event) {
    const step = STEP_KEYS[event.key]
    if (!step && event.key !== 'Home' && event.key !== 'End') return
    const items = [...(listRef.current?.querySelectorAll('.conversation-row') || [])]
    if (!items.length) return
    const from = items.indexOf(document.activeElement)
    if (from === -1 && step) return
    event.preventDefault()
    const to = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : Math.min(Math.max(from + step, 0), items.length - 1)
    items[to].focus()
  }

  return (
    <section className="messaging-column conversation-list" aria-label="Conversations">
      <header className="list-head">
        <div className="row row-between">
          <h2 className="column-title">Conversations</h2>
          {unreadTotal > 0 && (
            <span className="unread-total" aria-label={`${unreadTotal} unread messages`}>
              {unreadTotal} new
            </span>
          )}
          <Button size="xs" variant="secondary" onClick={onNew}>
            <Icon name="plus" size={14} />
            <span className="btn-content">New</span>
          </Button>
        </div>

        <label className="field">
          <span className="visually-hidden">Search conversations</span>
          <span className="search-field">
            <Icon name="search" size={15} />
            <input
              ref={searchRef}
              className="input input-sm"
              type="search"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return
                event.stopPropagation()
                if (query) onQuery('')
                else event.currentTarget.blur()
              }}
              placeholder="Search people, classes, messages"
            />
            <kbd className="search-key" aria-hidden="true">
              Ctrl K
            </kbd>
          </span>
        </label>

        <div className="list-tabs">
          <button
            type="button"
            className={`list-tab${scope === 'all' ? ' is-on' : ''}`}
            aria-pressed={scope === 'all'}
            onClick={() => setScope('all')}
          >
            All
            <span className="tab-count">{rows.length}</span>
          </button>
          <button
            type="button"
            className={`list-tab${scope === 'unread' ? ' is-on' : ''}`}
            aria-pressed={scope === 'unread'}
            onClick={() => setScope('unread')}
          >
            Unread
            <span className="tab-count">{unread.length}</span>
          </button>
        </div>
      </header>

      <div className="list-scroll" ref={listRef} onKeyDown={moveFocus}>
        {loading && <ListSkeleton items={6} lines={2} avatar label="Loading conversations…" />}

        {!loading && error && (
          <div className="card-body">
            <ErrorMessage error={error} title="Could not load conversations" onRetry={onRetry} />
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <EmptyState
            icon="inbox"
            title={
              query ? 'No match' : scope === 'unread' ? 'Nothing unread' : 'No conversations yet'
            }
            message={
              query
                ? 'Nothing in your threads matches that search.'
                : scope === 'unread'
                  ? 'Every thread you belong to is caught up.'
                  : 'Start a thread with a classmate, teacher or parent.'
            }
          />
        )}

        {!loading &&
          visible.map((row) => {
            const partnerOnline = row.partner ? presence.has(row.partner.id) || row.partner.online : false
            return (
              <button
                type="button"
                key={row.id}
                className={[
                  'conversation-row',
                  row.id === activeId && 'is-active',
                  row.unread_count > 0 && 'has-unread',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onSelect(row.id)}
                aria-current={row.id === activeId ? 'true' : undefined}
              >
                <span className="row-avatar">
                  <span className="avatar" aria-hidden="true">
                    {initials(row.display_name)}
                  </span>
                  {partnerOnline && <span className="presence-dot" aria-hidden="true" />}
                </span>

                <span className="row-body">
                  <span className="row-top">
                    <span className="row-name text-truncate">{row.display_name}</span>
                    <span className="row-time">{listMoment(row.updated_at)}</span>
                  </span>

                  <span className="row-preview">{previewOf(row, myUserId)}</span>

                  <span className="row-foot">
                    <span className="badge badge-neutral">
                      {row.kind === 'direct' && row.partner
                        ? roleLabel(row.partner.role)
                        : row.kind_label}
                    </span>
                    {row.is_archived && <span className="badge badge-amber">Archived</span>}
                    {row.unread_count > 0 && (
                      <span className="unread-chip" aria-label={`${row.unread_count} unread`}>
                        {row.unread_count}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            )
          })}
      </div>
    </section>
  )
}
