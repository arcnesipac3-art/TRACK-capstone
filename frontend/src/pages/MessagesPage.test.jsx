/**
 * The messaging screen, with the server replaced by the payloads the real
 * endpoints return and the socket replaced by a recorder. What is under test is
 * the page's own promises: one copy of a message, an optimistic row that the
 * stored row replaces, and a live event that updates the column it belongs to.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MessagesPage from './MessagesPage'
import api from '../services/api'
import useFetch from '../hooks/useFetch'

const recording = vi.hoisted(() => ({
  options: null,
  frames: [],
  user: null,
  canSend: true,
}))

vi.mock('../services/api', () => {
  const api = {
    get: vi.fn(),
    list: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    ensureCsrf: vi.fn(),
  }
  return { default: api, api, API_BASE: '/api', ApiError: class ApiError extends Error {} }
})

vi.mock('../hooks/useFetch', () => ({ default: vi.fn() }))

vi.mock('../context/AuthContext', async () => {
  const { createContext } = await import('react')
  return {
    default: createContext(null),
    useAuth: () => ({ user: recording.user, loading: false, signOut: vi.fn() }),
  }
})

vi.mock('../services/realtime', () => ({
  HEARTBEAT_MS: 25000,
  socketUrl: () => 'ws://localhost:3000/api/ws/messaging/',
  default: vi.fn((options) => {
    recording.options = options
    const frame = (action, ...rest) => recording.frames.push([action, ...rest])
    return {
      start: vi.fn(),
      stop: vi.fn(),
      isLive: () => recording.canSend,
      send: vi.fn(() => recording.canSend),
      subscribe: (id) => frame('subscribe', id),
      unsubscribe: (id) => frame('unsubscribe', id),
      newestSeq: () => null,
      postMessage: (id, body, meta) => {
        frame('send', id, body, meta)
        return recording.canSend
      },
      typing: (id, value) => frame('typing', id, value),
      markRead: (id, seq) => frame('read', id, seq),
      markDelivered: (id, seq) => frame('delivered', id, seq),
    }
  }),
}))

const ME = { id: 5, fullName: 'Ana Reyes', role: 'teacher', username: 'ana.reyes' }

const DIRECT = {
  id: 7,
  display_name: 'Ramon Villanueva',
  kind: 'direct',
  kind_label: 'Direct',
  is_archived: false,
  updated_at: '2026-11-01T08:00:00Z',
  section: null,
  department: null,
  member_count: 2,
  unread_count: 2,
  last_message: {
    id: 40,
    seq: 12,
    conversation: 7,
    sender: 9,
    sender_name: 'Ramon Villanueva',
    sender_role: 'student',
    body: 'Can I see the sheet first?',
    client_reference: null,
    created_at: '2026-11-01T08:00:00Z',
  },
  partner: { id: 9, full_name: 'Ramon Villanueva', role: 'student', online: false },
}

const CLASS_ROW = {
  id: 8,
  display_name: 'Grade 7-A',
  kind: 'class',
  kind_label: 'Class',
  is_archived: false,
  updated_at: '2026-10-30T01:00:00Z',
  section: 3,
  department: null,
  member_count: 21,
  unread_count: 0,
  last_message: null,
  partner: null,
}

const LIST = { results: [DIRECT, CLASS_ROW], unread_total: 2 }

const CONTACTS = [{ id: 11, username: 'ccruz', full_name: 'Celia Cruz', role: 'parent', detail: '', online: false }]

const OPTIONS = {
  sections: [{ id: 3, name: 'Grade 7-A' }],
  departments: [],
  can_create_group: true,
  vapid_public_key: null,
}

const DETAIL = {
  id: 7,
  kind: 'direct',
  kind_label: 'Direct',
  display_name: 'Ramon Villanueva',
  title: '',
  section: null,
  department: null,
  is_archived: false,
  created_at: '2026-10-28T01:00:00Z',
  updated_at: '2026-11-01T08:00:00Z',
  can_manage_members: false,
  can_post: true,
  unread_count: 2,
  status: { delivered: 0, read: 0, total: 1, of_newest: 12 },
  members: [
    {
      user_id: 5,
      full_name: 'Ana Reyes',
      role: 'owner',
      role_label: 'Owner',
      user_role: 'teacher',
      online: true,
      last_read_seq: 12,
      unread_count: 0,
      joined_at: '2026-10-28T01:00:00Z',
    },
    {
      user_id: 9,
      full_name: 'Ramon Villanueva',
      role: 'member',
      role_label: 'Member',
      user_role: 'student',
      online: false,
      last_read_seq: 10,
      unread_count: null,
      joined_at: '2026-10-28T01:05:00Z',
    },
  ],
}

function message(id, seq, sender, body, when = '2026-11-01T08:00:00Z') {
  return {
    id,
    conversation: 7,
    seq,
    sender,
    sender_name: sender === ME.id ? ME.fullName : 'Ramon Villanueva',
    sender_role: sender === ME.id ? 'teacher' : 'student',
    body,
    client_reference: null,
    created_at: when,
  }
}

const HISTORY = {
  messages: [
    message(39, 11, 9, 'Ma’am, is the portfolio due Friday?', '2026-11-01T07:50:00Z'),
    message(40, 12, ME.id, 'Friday, before 3pm.'),
  ],
  has_more: true,
}

const SETTINGS = {
  notify_in_app: true,
  notify_push: false,
  push_available: false,
  push_subscriptions: 0,
}

function mockServer(thread = DETAIL, history = HISTORY) {
  api.get.mockImplementation(async (path) => {
    if (path === '/messaging/conversations/7/') return thread
    if (path === '/messaging/conversations/7/messages/') return history
    if (path === '/messaging/settings/') return SETTINGS
    if (path === '/messaging/options/') return OPTIONS
    throw new Error(`Unexpected GET ${path}`)
  })
}

function mockFetch() {
  const idle = { data: null, loading: false, error: null, reload: vi.fn() }
  useFetch.mockImplementation((path, options) => {
    if (path === '/messaging/conversations/') return { ...idle, data: LIST, options }
    if (path === '/messaging/contacts/') return { ...idle, data: CONTACTS }
    if (path === '/messaging/options/') return { ...idle, data: OPTIONS }
    return idle
  })
}

function renderPage(entry = '/messages') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <MessagesPage />
    </MemoryRouter>
  )
}

/** Deliver a server event exactly as the socket would. */
function emit(event) {
  act(() => recording.options.onEvent(event))
}

const framesFor = (action) => recording.frames.filter((frame) => frame[0] === action)

beforeEach(() => {
  vi.clearAllMocks()
  // An unsaved draft is kept per conversation on purpose; between tests it
  // would otherwise look like a message the user never sent.
  window.localStorage.clear()
  recording.user = ME
  recording.frames = []
  recording.canSend = true
  mockFetch()
  mockServer()
})

describe('the conversation list', () => {
  it('shows the threads the server returned, with their unread counts', async () => {
    renderPage()

    expect(await screen.findByText('Ramon Villanueva')).toBeInTheDocument()
    expect(screen.getByText('Grade 7-A')).toBeInTheDocument()
    expect(screen.getByLabelText('2 unread')).toBeInTheDocument()
    expect(screen.getByLabelText('2 unread messages')).toHaveTextContent('2 new')
    expect(screen.getByText('Ramon Villanueva: Can I see the sheet first?')).toBeInTheDocument()
  })

  it('sends a search to the server rather than filtering the loaded page', async () => {
    renderPage()
    await screen.findByText('Grade 7-A')

    await userEvent.type(screen.getByPlaceholderText(/Search people/), 'grade')

    await waitFor(() =>
      expect(useFetch).toHaveBeenCalledWith('/messaging/conversations/', { params: { q: 'grade' } })
    )
  })

  it('offers the new-conversation composer', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /^New$/ }))

    expect(await screen.findByRole('dialog', { name: /New conversation/i })).toBeInTheDocument()
    expect(screen.getByText('Celia Cruz')).toBeInTheDocument()
  })
})

describe('opening a thread', () => {
  it('loads its history, joins it on the socket and marks it read', async () => {
    renderPage('/messages?conversation=7')

    expect(await screen.findByText('Friday, before 3pm.')).toBeInTheDocument()
    expect(screen.getByText('Ma’am, is the portfolio due Friday?')).toBeInTheDocument()
    expect(framesFor('subscribe')).toEqual([['subscribe', 7]])
    expect(framesFor('read')).toEqual([['read', 7, null]])
    // Opening is the acknowledgement: the row stops claiming unread mail.
    expect(screen.queryByLabelText('2 unread')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Conversation' })).toBeInTheDocument()
  })

  it('keeps the composer locked when the server says the thread is closed', async () => {
    mockServer({ ...DETAIL, can_post: false, is_archived: true })
    renderPage('/messages?conversation=7')

    expect(
      await screen.findByText('This conversation is archived — no new messages.')
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument()
  })

  it('shows the earlier-messages control only while the server has more history', async () => {
    renderPage('/messages?conversation=7')

    expect(await screen.findByRole('button', { name: 'Load earlier messages' })).toBeInTheDocument()
  })
})

describe('live events', () => {
  it('appends a message to the open thread once, not twice', async () => {
    renderPage('/messages?conversation=7')
    await screen.findByText('Friday, before 3pm.')

    emit({ event: 'inbox.message', conversation_id: 7, message: message(41, 13, 9, 'Thank you, ma’am!') })

    expect(await screen.findAllByText('Thank you, ma’am!')).toHaveLength(1)
  })

  it('bumps the unread count of a thread that is not open', async () => {
    renderPage()
    await screen.findByText('Grade 7-A')

    emit({
      event: 'inbox.message',
      conversation_id: 8,
      message: { ...message(41, 13, 12, 'Attendance sheet is ready'), conversation: 8, sender_name: 'Vice' },
    })

    const row = screen.getByText('Grade 7-A').closest('button')
    expect(await within(row).findByLabelText('1 unread')).toBeInTheDocument()
    expect(within(row).getByText('Vice: Attendance sheet is ready')).toBeInTheDocument()
  })

  it('shows and clears a typing indicator', async () => {
    renderPage('/messages?conversation=7')
    await screen.findByText('Friday, before 3pm.')

    emit({ event: 'typing.update', conversation_id: 7, user_id: 9, name: 'Ramon', is_typing: true })
    expect(await screen.findByText(/Ramon is typing/)).toBeInTheDocument()

    emit({ event: 'typing.update', conversation_id: 7, user_id: 9, name: 'Ramon', is_typing: false })
    await waitFor(() => expect(screen.queryByText(/is typing/)).not.toBeInTheDocument())
  })

  it('walks my own message through sent, delivered and read', async () => {
    renderPage('/messages?conversation=7')
    await screen.findByText('Friday, before 3pm.')
    // The details column reports the same words as counts, so the tick line is
    // read where it is drawn: inside the thread.
    const log = within(screen.getByRole('log'))
    // Ramon's marker is at 10 and this message is 12: nothing has reached him.
    expect(log.getByText('Sent')).toBeInTheDocument()
    expect(screen.queryByText(/Read by/)).not.toBeInTheDocument()

    emit({ event: 'message.delivered', conversation_id: 7, user_id: 9, seq: 12 })
    expect(await log.findByText('Delivered')).toBeInTheDocument()

    emit({ event: 'message.read', conversation_id: 7, user_id: 9, seq: 12 })
    expect(await log.findByText('Read')).toBeInTheDocument()
    expect(log.queryByText('Delivered')).not.toBeInTheDocument()
  })

  it('counts what arrived while the reader was scrolled back', async () => {
    const { container } = renderPage('/messages?conversation=7')
    await screen.findByText('Friday, before 3pm.')

    const scroller = container.querySelector('.thread-scroll')
    // jsdom gives no layout, so the box is described the way a real one would be.
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1200 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 500 })
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, writable: true, value: 40 })
    fireEvent.scroll(scroller)

    const pill = await screen.findByRole('button', { name: 'Jump to latest' })

    emit({ event: 'inbox.message', conversation_id: 7, message: message(41, 13, 9, 'Sorry, one more thing') })

    expect(await within(pill).findByText('1 new message')).toBeInTheDocument()

    await userEvent.click(pill)
    expect(scroller.scrollTop).toBe(1200)
    expect(screen.queryByRole('button', { name: /Jump to latest|new message/ })).not.toBeInTheDocument()
  })

  it('reflects a presence change in the thread header', async () => {
    renderPage('/messages?conversation=7')
    await screen.findByText('Friday, before 3pm.')
    expect(screen.getByText('Student · offline')).toBeInTheDocument()

    emit({ event: 'presence', user_id: 9, online: true })

    expect(await screen.findByText('Online now')).toBeInTheDocument()
  })

  it('surfaces a server rejection without losing the thread', async () => {
    renderPage('/messages?conversation=7')
    await screen.findByText('Friday, before 3pm.')

    emit({ event: 'error', request_id: 'ref-x', message: 'That conversation is archived.' })

    expect(await screen.findByText(/That conversation is archived/)).toBeInTheDocument()
    expect(screen.getByText('Friday, before 3pm.')).toBeInTheDocument()
  })
})

describe('the details column', () => {
  it('is on screen with an open thread, and both toggles move it', async () => {
    renderPage('/messages?conversation=7')
    await screen.findByRole('complementary', { name: 'Conversation details' })

    await userEvent.click(screen.getByRole('button', { name: 'Hide details' }))

    expect(screen.queryByRole('complementary', { name: 'Conversation details' })).not.toBeInTheDocument()
    // The header offers the control only once there is something to show.
    await userEvent.click(screen.getByRole('button', { name: 'Show conversation details' }))
    expect(await screen.findByRole('complementary', { name: 'Conversation details' })).toBeInTheDocument()
  })

  it('never offers a details toggle before a thread is open', async () => {
    renderPage()
    await screen.findByText('Grade 7-A')

    expect(screen.queryByRole('button', { name: /conversation details/i })).not.toBeInTheDocument()
  })

  it('holds its actions inert while one is running, then says what happened', async () => {
    mockServer({ ...DETAIL, can_manage_members: true })
    let settled
    api.post.mockImplementation(
      () =>
        new Promise((resolve) => {
          settled = resolve
        })
    )
    renderPage('/messages?conversation=7')

    const archive = await screen.findByRole('button', { name: 'Archive' })
    await userEvent.click(archive)

    expect(screen.getByRole('button', { name: 'Archive' }).closest('button')).toBeDisabled()
    expect(screen.getByRole('button', { name: /Leave conversation/ })).toBeDisabled()
    expect(archive.closest('button')).toHaveClass('btn-loading')

    settled({})
    expect(await screen.findByText('Conversation archived.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archive' }).closest('button')).toBeEnabled()
  })

  it('refuses to let one press leave a conversation', async () => {
    mockServer({ ...DETAIL, can_manage_members: true })
    api.delete.mockResolvedValue({})
    renderPage('/messages?conversation=7')

    const leave = await screen.findByRole('button', { name: 'Leave conversation' })
    await userEvent.click(leave)

    expect(api.delete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Tap again to leave' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Tap again to leave' }))
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith('/messaging/conversations/7/members/', {
        params: { user_id: ME.id },
      })
    )
  })
})

describe('sending', () => {
  it('shows an optimistic copy and replaces it with the stored row', async () => {
    renderPage('/messages?conversation=7')
    await screen.findByText('Friday, before 3pm.')

    await userEvent.type(screen.getByLabelText('Message'), 'Bring it to my room.')
    await userEvent.keyboard('{Enter}')

    expect(screen.getByText('Sending…')).toBeInTheDocument()
    const sent = framesFor('send')[0]
    expect(sent[1]).toBe(7)
    expect(sent[2]).toBe('Bring it to my room.')

    emit({
      event: 'message.sent',
      conversation_id: 7,
      message: { ...message(42, 14, ME.id, 'Bring it to my room.'), client_reference: sent[3].clientReference },
    })

    expect(await screen.findAllByText('Bring it to my room.')).toHaveLength(1)
    expect(screen.queryByText('Sending…')).not.toBeInTheDocument()
  })

  it('posts over HTTPS when the socket cannot take the frame', async () => {
    // The server answers a REST send with the row it stored, tagged with the
    // client_reference it was given — that is what collapses the optimistic
    // copy into one bubble.
    api.post.mockImplementation(async (path, body) => ({
      message: { ...message(43, 14, ME.id, body.body), client_reference: body.client_reference },
      created: true,
    }))
    renderPage('/messages?conversation=7')
    await screen.findByText('Friday, before 3pm.')

    recording.canSend = false
    await userEvent.type(screen.getByLabelText('Message'), 'Sent while offline.')
    await userEvent.keyboard('{Enter}')

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/messaging/conversations/7/messages/',
        expect.objectContaining({ body: 'Sent while offline.' })
      )
    )
    expect(await screen.findAllByText('Sent while offline.')).toHaveLength(1)
    expect(screen.queryByText('Sending…')).not.toBeInTheDocument()
  })

  it('tells the other side when this user is typing', async () => {
    renderPage('/messages?conversation=7')
    await screen.findByText('Friday, before 3pm.')

    await userEvent.type(screen.getByLabelText('Message'), 'H')

    await waitFor(() => expect(framesFor('typing')).toContainEqual(['typing', 7, true]))
  })

  it('stops announcing typing when the composer is emptied', async () => {
    renderPage('/messages?conversation=7')
    await screen.findByText('Friday, before 3pm.')

    const composer = screen.getByLabelText('Message')
    await userEvent.type(composer, 'H')
    await userEvent.clear(composer)

    await waitFor(() => expect(framesFor('typing')).toContainEqual(['typing', 7, false]))
  })
})

describe('reading the thread like a chat', () => {
  it('gives a run of messages from one speaker one avatar and one clock line', async () => {
    mockServer(DETAIL, {
      messages: [
        message(50, 20, 9, 'Two lines in a row'),
        message(51, 21, 9, 'Sent one after the other'),
        message(52, 22, ME.id, 'Understood.'),
      ],
      has_more: false,
    })
    renderPage('/messages?conversation=7')

    const opening = await screen.findByText('Two lines in a row')
    const group = opening.closest('.bubble-group')
    const second = within(group).getByText('Sent one after the other').closest('.bubble-row')

    expect(group.querySelectorAll('.bubble-row')).toHaveLength(2)
    expect(group.querySelectorAll('.avatar')).toHaveLength(1)
    expect(opening.closest('.bubble-row')).toHaveClass('is-first')
    expect(second).not.toHaveClass('is-first')
    expect(second).toHaveClass('is-last')
    expect(screen.getByText('Understood.').closest('.bubble-group')).not.toBe(group)
  })

  it('marks where the unread mail starts when the thread opens', async () => {
    // The list row said two unread, and the page that came back ends at seq 12.
    renderPage('/messages?conversation=7')
    await screen.findByText('Friday, before 3pm.')

    expect(await screen.findByText('2 new')).toBeInTheDocument()
  })

  it('quotes a message into the composer', async () => {
    renderPage('/messages?conversation=7')
    const bubble = (await screen.findByText('Ma’am, is the portfolio due Friday?')).closest(
      '.bubble-row'
    )

    await userEvent.click(within(bubble).getByRole('button', { name: 'Quote in a reply' }))

    expect(screen.getByLabelText('Message')).toHaveValue('> Ma’am, is the portfolio due Friday?\n')
  })

  it('copies a message when the browser allows it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    renderPage('/messages?conversation=7')
    const bubble = (await screen.findByText('Friday, before 3pm.')).closest('.bubble-row')

    await userEvent.click(within(bubble).getByRole('button', { name: 'Copy message' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Friday, before 3pm.'))
    expect(within(bubble).getByRole('button', { name: 'Message copied' })).toBeInTheDocument()
  })

  it('does not claim a copy the browser refused', async () => {
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    })
    renderPage('/messages?conversation=7')
    const bubble = (await screen.findByText('Friday, before 3pm.')).closest('.bubble-row')

    await userEvent.click(within(bubble).getByRole('button', { name: 'Copy message' }))

    expect(within(bubble).queryByRole('button', { name: 'Message copied' })).not.toBeInTheDocument()
  })

  it('keeps an unsaved draft when the thread is closed and reopened', async () => {
    const view = renderPage('/messages?conversation=7')
    await screen.findByText('Friday, before 3pm.')
    await userEvent.type(screen.getByLabelText('Message'), 'Drafted, not sent')
    view.unmount()

    renderPage('/messages?conversation=7')
    await screen.findByText('Friday, before 3pm.')

    expect(screen.getByLabelText('Message')).toHaveValue('Drafted, not sent')
  })

  it('spins the earlier-messages control while the next page is in flight', async () => {
    renderPage('/messages?conversation=7')
    await screen.findByText('Friday, before 3pm.')

    let release
    api.get.mockImplementation((path) => {
      if (path === '/messaging/conversations/7/messages/')
        return new Promise((resolve) => {
          release = () => resolve({ messages: [], has_more: false })
        })
      if (path === '/messaging/settings/') return Promise.resolve(SETTINGS)
      if (path === '/messaging/options/') return Promise.resolve(OPTIONS)
      return Promise.resolve(DETAIL)
    })

    await userEvent.click(screen.getByRole('button', { name: /Load earlier messages/ }))

    expect(api.get).toHaveBeenCalledWith('/messaging/conversations/7/messages/', {
      params: { limit: 50, before_seq: 11 },
    })
    expect(
      screen.getByRole('button', { name: /Load earlier messages/ }).className
    ).toContain('btn-loading')

    release()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Load earlier messages/ })).not.toBeInTheDocument()
    )
  })

  it('says what to do when no thread is open', async () => {
    renderPage()

    expect(await screen.findByRole('region', { name: 'No conversation selected' })).toBeInTheDocument()
    expect(screen.getByText('Pick a conversation')).toBeInTheDocument()
  })
})

describe('scanning the list', () => {
  it('filters to the threads with unread mail', async () => {
    renderPage()
    await screen.findByText('Grade 7-A')

    await userEvent.click(screen.getByRole('button', { name: /Unread/ }))
    expect(screen.getByText('Ramon Villanueva')).toBeInTheDocument()
    expect(screen.queryByText('Grade 7-A')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /All/ }))
    expect(screen.getByText('Grade 7-A')).toBeInTheDocument()
  })

  it('walks the rows with the arrow keys', async () => {
    renderPage()
    const first = (await screen.findByText('Ramon Villanueva')).closest('.conversation-row')

    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })

    expect(screen.getByText('Grade 7-A').closest('.conversation-row')).toHaveFocus()
  })

  it('focuses the search on Ctrl+K', async () => {
    renderPage()
    await screen.findByText('Grade 7-A')

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })

    expect(screen.getByPlaceholderText(/Search people/)).toHaveFocus()
  })
})
