/**
 * The bell, with the list the server actually returns. A message notification
 * has to be answerable from here, so the one thing under test is where a tap
 * goes: the thread it came from, and nothing for the older notification types.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import NotificationsPage from './NotificationsPage'
import useFetch from '../hooks/useFetch'

vi.mock('../hooks/useFetch', () => ({ default: vi.fn() }))

const messageItem = {
  id: 12,
  notif_type: 'message_received',
  title: 'Tina Teacher',
  body: 'Bring the printed copy tomorrow.',
  is_read: false,
  message: 41,
  conversation: 7,
  created_at: '2026-11-01T09:12:00Z',
}

const announcementItem = {
  id: 13,
  notif_type: 'announcement',
  title: 'Reporting schedule moved to Friday',
  body: 'All sections report on Friday this week.',
  is_read: false,
  message: null,
  conversation: null,
  created_at: '2026-11-01T08:00:00Z',
}

function renderBell(items) {
  vi.mocked(useFetch).mockReturnValue({ data: items, loading: false, error: null, reload: vi.fn() })
  return render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>
  )
}

describe('NotificationsPage', () => {
  it('links a message bell item to its thread', () => {
    renderBell([messageItem])
    const link = screen.getByRole('link', { name: 'Open thread' })
    expect(link).toHaveAttribute('href', '/messages/?conversation=7')
    expect(screen.getByText('Message')).toBeInTheDocument()
  })

  it('offers no thread link for a notification that is not a message', () => {
    renderBell([announcementItem])
    expect(screen.queryByRole('link', { name: 'Open thread' })).not.toBeInTheDocument()
    expect(screen.getByText('Announcement')).toBeInTheDocument()
  })
})
