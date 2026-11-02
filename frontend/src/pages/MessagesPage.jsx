import { useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useSearchParams } from 'react-router-dom'

import ConversationList from '../components/messaging/ConversationList'
import MessageThread from '../components/messaging/MessageThread'
import ThreadDetails from '../components/messaging/ThreadDetails'
import NewThreadModal from '../components/messaging/NewThreadModal'
import Icon from '../components/Icon'
import useFetch from '../hooks/useFetch'
import api from '../services/api'
import createMessagingSocket from '../services/realtime'
import { NotificationsContext } from '../context/NotificationsContext'
import { useAuth } from '../context/AuthContext'
import { dedupeMessages, dropMessage, markFailed, newReference, unreadSplit, upsertMessage } from '../utils/messaging'
import './MessagesPage.css'

const HISTORY_LIMIT = 50

/** Typing is advisory: with no follow-up frame the indicator has to expire. */
const TYPING_TTL_MS = 6000

const NARROW = '(max-width: 767px)'
const MEDIUM = '(max-width: 1279px)'

function useMediaQuery(query) {
  // Some test environments (and very old browsers) have no matchMedia at all;
  // the layout then behaves as the widest case, which is what the columns are
  // designed to collapse into anyway.
  const supported = typeof window.matchMedia === 'function'
  const subscribe = useCallback(
    (onStoreChange) => {
      if (!supported) return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', onStoreChange)
      return () => list.removeEventListener('change', onStoreChange)
    },
    [query, supported]
  )
  const getSnapshot = useCallback(
    () => (supported ? window.matchMedia(query).matches : false),
    [query, supported]
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export default function MessagesPage() {
  const { user } = useAuth()
  const notifications = useContext(NotificationsContext)
  const [params, setParams] = useSearchParams()
  const activeId = Number(params.get('conversation')) || null

  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')

  const listFetch = useFetch('/messaging/conversations/', { params: { q: debounced } })
  const reloadList = listFetch.reload
  const contactsFetch = useFetch('/messaging/contacts/', { list: true })
  const optionsFetch = useFetch('/messaging/options/')

  const [snapshot, setSnapshot] = useState(listFetch.data)
  const [patches, setPatches] = useState(() => new Map())
  const [hoisted, setHoisted] = useState([])
  const [messages, setMessages] = useState([])
  const [history, setHistory] = useState({ loading: false, error: null, hasMore: false })
  const [thread, setThread] = useState(null)
  // Where the unread mail in the open thread starts, and how much of it there
  // was. Both halves are captured independently — the count from the list the
  // moment it is known, the newest loaded sequence when the first page lands —
  // and joined below, because a deep link settles them in either order.
  const [unreadCount, setUnreadCount] = useState(null)
  const [pageNewest, setPageNewest] = useState(null)
  const [presence, setPresence] = useState(() => new Set())
  const [typing, setTyping] = useState(() => new Map())
  const [connection, setConnection] = useState('connecting')
  const [notice, setNotice] = useState(null)
  const [creating, setCreating] = useState(false)
  const [pane, setPane] = useState('list')
  const [busyKey, setBusyKey] = useState(null)
  const [detailsClosedAtWide, setDetailsClosedAtWide] = useState(false)
  const [openedId, setOpenedId] = useState(activeId)

  const narrow = useMediaQuery(NARROW)
  const medium = useMediaQuery(MEDIUM)

  const socketRef = useRef(null)
  const handlerRef = useRef(null)
  // The async callbacks below outlive the render that created them; a click
  // that moves to another thread must not let their responses land on it.
  const activeRef = useRef(activeId)

  useEffect(() => {
    activeRef.current = activeId
  }, [activeId])

  // Two resets, done during render instead of in an effect: the state they
  // clear belongs to a thread or a fetch that no longer exists, so the screen
  // must not paint the old one for a frame first. React re-renders this pass
  // immediately without committing it.
  if (openedId !== activeId) {
    setUnreadCount(null)
    setPageNewest(null)
    setOpenedId(activeId)
    setThread(null)
    setMessages([])
    setTyping(new Map())
    setHistory({ loading: Boolean(activeId), error: null, hasMore: false })
  }
  if (listFetch.data !== snapshot) {
    // The server owns the list. A live patch (unread bump, newer preview)
    // rides on top of the last fetch and is replaced by the next one, so a
    // count the server already settled cannot be re-added by a stale event.
    setSnapshot(listFetch.data)
    setPatches(new Map())
    setHoisted([])
  }

  const rows = useMemo(() => {
    const base = (snapshot?.results || []).map((row) => {
      const patched = patches.has(row.id) ? { ...row, ...patches.get(row.id) } : row
      // Opening a thread sends the read marker, so its row stops claiming
      // unread mail the moment it is on screen — the next fetch agrees.
      return patched.id === activeId ? { ...patched, unread_count: 0 } : patched
    })
    const touched = hoisted
      .map((id) => base.find((row) => row.id === id))
      .filter(Boolean)
    return [...touched, ...base.filter((row) => !hoisted.includes(row.id))]
  }, [snapshot, patches, hoisted, activeId])

  const activeRow = useMemo(
    () => rows.find((row) => row.id === activeId) || null,
    [rows, activeId]
  )

  // The header count comes from the server and still includes the thread this
  // tab has just read, so subtract what opening it settled.
  const openUnread = useMemo(
    () => (snapshot?.results || []).find((row) => row.id === activeId)?.unread_count || 0,
    [snapshot, activeId]
  )

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])

  /**
   * Catch the unread count of the open thread before the read marker this tab
   * sends settles it. Opening a deep-linked conversation happens before the
   * list has ever been fetched, so the count arrives when it arrives, and the
   * first one seen is the one that was true on entry. Written during render
   * for the same reason as the resets above: the value belongs to this paint.
   */
  if (!unreadCount && activeId && openUnread) {
    setUnreadCount({ id: activeId, count: openUnread })
  }

  const unreadMark = useMemo(() => {
    if (!unreadCount || !pageNewest) return null
    if (unreadCount.id !== activeId || pageNewest.id !== activeId) return null
    const seq = unreadSplit(unreadCount.count, pageNewest.seq)
    return seq ? { seq, count: unreadCount.count } : null
  }, [unreadCount, pageNewest, activeId])

  // ----------------------------------------------------------------- socket

  // Declared before the thread effect: opening a deep-linked conversation has
  // to be able to subscribe it, and a ref set in a later effect would still be
  // null on this first pass.
  useEffect(() => {
    const socket = createMessagingSocket({
      onStatus: setConnection,
      onEvent: (event) => handlerRef.current?.(event),
    })
    socketRef.current = socket
    socket.start()
    return () => {
      socketRef.current = null
      socket.stop()
    }
  }, [])

  // ---------------------------------------------------------------- history

  /** Older pages and retries; the first page is fetched with the thread. */
  const loadHistory = useCallback(async (conversationId, { beforeSeq } = {}) => {
    if (!conversationId) return
    // Set before the request, not after: the control that started it has to
    // look busy while the page is in flight.
    setHistory((current) => ({ ...current, loading: true, error: null }))
    try {
      const page = await api.get(`/messaging/conversations/${conversationId}/messages/`, {
        params: {
          limit: HISTORY_LIMIT,
          ...(beforeSeq != null ? { before_seq: beforeSeq } : {}),
        },
      })
      if (activeRef.current !== conversationId) return
      // An earlier page arrives whole; the rows this tab already holds — live
      // copies and pending sends — stay in it.
      setMessages((current) => dedupeMessages([...page.messages, ...current]))
      setHistory({ loading: false, error: null, hasMore: page.has_more })
    } catch (error) {
      if (activeRef.current === conversationId) {
        setHistory((current) => ({ ...current, loading: false, error }))
      }
    }
  }, [])

  // ----------------------------------------------------------- open a thread

  useEffect(() => {
    if (!activeId) return undefined
    let active = true
    api
      .get(`/messaging/conversations/${activeId}/`)
      .then((detail) => active && setThread(detail))
      .catch((error) => active && setNotice({ tone: 'error', text: error.message }))

    // `loading` was set when the thread id changed; only the settled pages are
    // written from here, so the fetch never re-enters the render path.
    api
      .get(`/messaging/conversations/${activeId}/messages/`, { params: { limit: HISTORY_LIMIT } })
      .then((page) => {
        if (!active) return
        // Merge, do not replace: a live message can arrive before history
        // lands, and a socket copy is not something to throw away.
        setMessages((current) => dedupeMessages([...page.messages, ...current]))
        setHistory({ loading: false, error: null, hasMore: page.has_more })
        const last = page.messages.length ? page.messages[page.messages.length - 1].seq : null
        if (last != null) setPageNewest({ id: activeId, seq: last })
      })
      .catch((error) => {
        if (active) setHistory((current) => ({ ...current, loading: false, error }))
      })

    const socket = socketRef.current
    socket?.subscribe(activeId)
    // Opening a thread is the acknowledgement: everything up to the newest
    // message is read, so the sender's receipt and the badge both settle.
    socket?.markRead(activeId, null)
    return () => {
      active = false
    }
  }, [activeId])

  /**
   * The one place where a server event becomes screen state.
   *
   * `message.new` is the thread copy and `inbox.message` is the list copy of
   * the same row — appending both would show one message twice, so each is
   * used for the column it belongs to and merged by identity either way.
   */
  useEffect(() => {
    function touchRow(conversationId, message, { unread }) {
      const base = (snapshot?.results || []).find((row) => row.id === conversationId)
      // A thread this tab has never listed — a group joined elsewhere, a new
      // direct thread. The server owns the list, so ask it rather than
      // inventing a row from one event.
      if (!base) {
        if (unread) reloadList()
        return
      }
      setPatches((current) => {
        const row = { ...base, ...(current.get(conversationId) || {}) }
        const next = new Map(current)
        next.set(conversationId, {
          ...row,
          last_message: message || row.last_message,
          updated_at: message?.created_at || row.updated_at,
          unread_count: row.unread_count + (unread && message?.sender !== user.id ? 1 : 0),
        })
        return next
      })
      setHoisted((current) =>
        current[0] === conversationId
          ? current
          : [conversationId, ...current.filter((id) => id !== conversationId)]
      )
    }

    /**
     * One member's marker moved forward. Both of them — how far a person has
     * received and how far they have read — arrive as live events, and the
     * thread's own tick line is computed from them, so a marker that is never
     * recorded is a receipt that never fills in.
     */
    function noteMarker(conversationId, readerId, seq, field) {
      setThread((current) =>
        !current || current.id !== conversationId || readerId == null
          ? current
          : {
              ...current,
              members: (current.members || []).map((member) =>
                member.user_id === readerId
                  ? { ...member, [field]: Math.max(member[field] || 0, seq || 0) }
                  : member
              ),
            }
      )
    }

    function handle(event) {
      const openId = activeRef.current
      const socket = socketRef.current

      switch (event.event) {
        case 'presence':
          setPresence((current) => {
            const next = new Set(current)
            if (event.online) next.add(event.user_id)
            else next.delete(event.user_id)
            return next
          })
          break

        case 'message.new':
          if (event.conversation_id === openId && event.message) {
            setMessages((current) => upsertMessage(current, event.message))
            socket?.markDelivered(openId, event.message.seq)
            if (document.hasFocus()) socket?.markRead(openId, event.message.seq)
          }
          touchRow(event.conversation_id, event.message, { unread: false })
          break

        case 'inbox.message':
          if (!event.message) break
          if (event.conversation_id === openId) {
            setMessages((current) => upsertMessage(current, event.message))
            if (document.hasFocus()) socket?.markRead(openId, event.message.seq)
          } else {
            touchRow(event.conversation_id, event.message, { unread: true })
          }
          break

        case 'message.sent':
          if (event.message) setMessages((current) => upsertMessage(current, event.message))
          if (event.duplicate) {
            setNotice({ tone: 'info', text: 'That message was already sent — it appears once.' })
          }
          break

        case 'messages.sync':
          if (event.conversation_id === openId) {
            setMessages((current) =>
              (event.messages || []).reduce((list, row) => upsertMessage(list, row), current)
            )
          }
          break

        case 'typing.update':
          if (event.user_id === user.id || event.conversation_id !== openId) break
          setTyping((current) => {
            const next = new Map(current)
            if (event.is_typing) {
              next.set(event.user_id, { name: event.name || 'Someone', at: Date.now() })
            } else {
              next.delete(event.user_id)
            }
            return next
          })
          break

        case 'message.read':
        case 'conversation.read':
          noteMarker(
            event.conversation_id,
            event.user_id ?? event.by_user_id,
            event.seq,
            'last_read_seq'
          )
          break

        case 'message.delivered':
          noteMarker(event.conversation_id, event.user_id, event.seq, 'last_delivered_seq')
          break

        case 'member.joined':
        case 'member.left':
          if (event.conversation_id === openId) {
            api
              .get(`/messaging/conversations/${openId}/`)
              .then(setThread)
              .catch(() => {})
          }
          break

        case 'conversation.added':
        case 'conversation.updated':
          reloadList()
          break

        case 'notifications.conversation_read':
          notifications?.reload?.()
          break

        case 'error':
          if (event.request_id) {
            setMessages((current) => markFailed(current, event.request_id))
          }
          setNotice({ tone: 'error', text: event.message || 'That did not go through.' })
          break

        default:
          break
      }
    }

    handlerRef.current = handle
    const expiry = setInterval(() => {
      setTyping((current) => {
        if (!current.size) return current
        const cutoff = Date.now() - TYPING_TTL_MS
        const next = new Map([...current].filter(([, entry]) => entry.at > cutoff))
        return next.size === current.size ? current : next
      })
    }, 1500)

    return () => {
      handlerRef.current = null
      clearInterval(expiry)
    }
  }, [notifications, reloadList, snapshot, user.id])

  // ---------------------------------------------------------------- sending

  function deliver(body, reference) {
    const socket = socketRef.current
    if (socket?.postMessage(activeId, body, { clientReference: reference, requestId: reference })) {
      return
    }
    // No live socket: HTTPS is the same write path, so a dropped connection
    // delays a message instead of losing it.
    api
      .post(`/messaging/conversations/${activeId}/messages/`, { body, client_reference: reference })
      .then((data) => setMessages((current) => upsertMessage(current, data.message)))
      .catch((error) => {
        setMessages((current) => markFailed(current, reference))
        setNotice({ tone: 'error', text: error.message })
      })
  }

  function send(body) {
    const reference = newReference()
    setMessages((current) =>
      upsertMessage(current, {
        client_reference: reference,
        conversation: activeId,
        sender: user.id,
        sender_name: user.fullName,
        body,
        created_at: new Date().toISOString(),
        pending: true,
        seq: null,
      })
    )
    setNotice(null)
    deliver(body, reference)
  }

  function retry(row) {
    setMessages((current) =>
      upsertMessage(current, { ...row, pending: true, failed: false, seq: null })
    )
    deliver(row.body, row.client_reference)
  }

  function openOlder() {
    const oldest = messages.find((row) => Number.isFinite(row.seq))
    if (oldest) loadHistory(activeId, { beforeSeq: oldest.seq })
  }

  // -------------------------------------------------------------- mutations

  /**
   * The detail-column actions.
   *
   * `key` names the control that started the request: it is what makes a click
   * feel like a click — every control goes inert and that one spins, so a second
   * press cannot send a second write — and `done` is what says back when the
   * server agreed. Without either, Archive looked dead for the length of the
   * round trip and silent after it.
   */
  async function mutate(key, request, { refreshThread = false, done = null } = {}) {
    setNotice(null)
    setBusyKey(key)
    try {
      await request()
      if (refreshThread && activeId) {
        setThread(await api.get(`/messaging/conversations/${activeId}/`))
      }
      reloadList()
      if (done) setNotice({ tone: 'info', text: done })
    } catch (error) {
      setNotice({ tone: 'error', text: error.message })
    } finally {
      setBusyKey(null)
    }
  }

  const addMember = (contact) =>
    mutate(
      `add-${contact.id}`,
      () => api.post(`/messaging/conversations/${activeId}/members/`, { user_ids: [contact.id] }),
      { refreshThread: true, done: `${contact.full_name} is in the conversation.` }
    )

  const removeMember = (member) =>
    mutate(
      `remove-${member.user_id}`,
      () =>
        api.delete(`/messaging/conversations/${activeId}/members/`, {
          params: { user_id: member.user_id },
        }),
      { refreshThread: true, done: `${member.full_name} was removed.` }
    )

  const syncMembers = () =>
    mutate('sync', () => api.post(`/messaging/conversations/${activeId}/sync-members/`, {}), {
      refreshThread: true,
      done: 'Roster re-checked against the records.',
    })

  const archive = (isArchived) =>
    mutate(
      'archive',
      () => api.post(`/messaging/conversations/${activeId}/archive/`, { is_archived: isArchived }),
      { refreshThread: true, done: isArchived ? 'Conversation archived.' : 'Conversation reopened.' }
    )

  const leave = () =>
    mutate(
      'leave',
      () => api.delete(`/messaging/conversations/${activeId}/members/`, { params: { user_id: user.id } }),
      { done: 'You left the conversation.' }
    )

  // ------------------------------------------------------------------ select

  function openConversation(id) {
    if (id && activeRef.current && id !== activeRef.current) {
      socketRef.current?.unsubscribe(activeRef.current)
    }
    const next = new URLSearchParams(params)
    if (id) next.set('conversation', String(id))
    else next.delete('conversation')
    setParams(next, { replace: true })
    setPane(id ? 'thread' : 'list')
  }

  const typingNames = useMemo(() => [...typing.values()].map((entry) => entry.name), [typing])

  /**
   * Which columns are on screen.
   *
   * Below the widest layout the details column is a drawer and `pane` says
   * whether it is the one open; at the widest layout all three are tracks and
   * the same control hides or brings back the third. Either way the button is
   * only offered when it can change something — it used to render at desktop
   * width while the column was hard-wired open, so pressing it only rewrote a
   * class no rule read.
   */
  const wide = !narrow && !medium
  const showList = !narrow || pane === 'list'
  const showThread = !narrow || pane === 'thread'
  const showDetails = Boolean(thread) && (wide ? !detailsClosedAtWide : pane === 'details')

  function toggleDetails() {
    if (wide) setDetailsClosedAtWide((closed) => !closed)
    else setPane((current) => (current === 'details' ? 'thread' : 'details'))
  }

  return (
    <div
      className={[
        'messages-page',
        narrow ? 'is-narrow' : medium ? 'is-medium' : 'is-wide',
        showDetails && 'has-details',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="messaging-grid">
        {showList && (
          <ConversationList
            rows={rows}
            loading={listFetch.loading}
            error={listFetch.error}
            query={query}
            onQuery={setQuery}
            activeId={activeId}
            onSelect={openConversation}
            onNew={() => setCreating(true)}
            onRetry={reloadList}
            presence={presence}
            myUserId={user.id}
            unreadTotal={Math.max(0, (snapshot?.unread_total || 0) - openUnread)}
          />
        )}

        {showThread && (
          <MessageThread
            key={activeId ?? 'none'}
            conversationId={activeId}
            thread={thread}
            partner={activeRow?.partner || null}
            messages={messages}
            loading={history.loading}
            error={history.error}
            hasMore={history.hasMore}
            typingNames={typingNames}
            presence={presence}
            connection={connection}
            myUserId={user.id}
            canPost={Boolean(thread?.can_post)}
            unreadMark={unreadMark}
            onBack={narrow ? () => setPane('list') : null}
            onShowDetails={thread && !showDetails ? toggleDetails : null}
            onNew={() => setCreating(true)}
            onSend={(body) => {
              send(body)
              socketRef.current?.typing(activeId, false)
            }}
            onTyping={(value) => {
              // An emptied box is not "still typing": the indicator has to stop
              // when the reader deletes their way back to nothing.
              socketRef.current?.typing(activeId, Boolean(value))
            }}
            onRetry={retry}
            onDismiss={(row) => setMessages((current) => dropMessage(current, row.client_reference))}
            onLoadOlder={openOlder}
            onRetryHistory={() => loadHistory(activeId)}
          />
        )}

        {showDetails && (
          <ThreadDetails
            thread={thread}
            presence={presence}
            myUserId={user.id}
            contacts={contactsFetch.data || []}
            optionsLoading={optionsFetch.loading}
            busyKey={busyKey}
            onClose={toggleDetails}
            onAddMember={addMember}
            onRemoveMember={removeMember}
            onSyncMembers={syncMembers}
            onArchive={archive}
            onLeave={() => {
              leave()
              openConversation(null)
            }}
          />
        )}
      </div>

      {notice && (
        <p className={`alert alert-${notice.tone} messaging-notice`} role="status">
          {notice.text}
          <button type="button" className="notice-dismiss" onClick={() => setNotice(null)}>
            <Icon name="close" size={14} />
            <span className="visually-hidden">Dismiss</span>
          </button>
        </p>
      )}

      <NewThreadModal
        open={creating}
        onClose={() => setCreating(false)}
        options={optionsFetch.data}
        contacts={contactsFetch.data || []}
        onCreated={(created) => {
          reloadList()
          openConversation(created.id)
        }}
      />
    </div>
  )
}
