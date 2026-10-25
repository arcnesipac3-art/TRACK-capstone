import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NotificationsCard from './NotificationsCard'
import { NotificationsContext } from '../../context/NotificationsContext'
import useFetch from '../../hooks/useFetch'

vi.mock('../../hooks/useFetch', () => ({ default: vi.fn() }))

const NOTIFICATIONS = [
  {
    id: 1,
    title: 'Requirement graded',
    is_read: false,
    created_at: '2026-10-23T08:00:00+08:00',
  },
  {
    id: 2,
    title: 'Attendance recorded',
    is_read: true,
    created_at: '2026-10-22T08:00:00+08:00',
  },
]

function renderCard(ui) {
  return render(
    <MemoryRouter>
      {ui}
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NotificationsCard', () => {
  it('renders the shared shell fetch without issuing its own request', () => {
    renderCard(
      <NotificationsContext.Provider
        value={{ data: NOTIFICATIONS, loading: false, error: null, reload: vi.fn() }}
      >
        <NotificationsCard />
      </NotificationsContext.Provider>
    )

    // Inside the app layout the bell's fetch is reused — no second request.
    expect(useFetch).not.toHaveBeenCalled()
    expect(screen.getByText('Requirement graded')).toBeInTheDocument()
    expect(screen.getByText('1 new')).toBeInTheDocument()
  })

  it('falls back to its own fetch when rendered outside the shell', () => {
    useFetch.mockReturnValue({
      data: NOTIFICATIONS,
      loading: false,
      error: null,
      reload: vi.fn(),
    })

    renderCard(<NotificationsCard />)

    expect(useFetch).toHaveBeenCalledWith('/notifications/', {
      list: true,
      params: { page_size: 100 },
    })
    expect(screen.getByText('Requirement graded')).toBeInTheDocument()
  })

  it('retries through the shared reload on an error state', async () => {
    const user = userEvent.setup()
    const reload = vi.fn()
    renderCard(
      <NotificationsContext.Provider
        value={{ data: null, loading: false, error: new Error('Notifications down'), reload }}
      >
        <NotificationsCard />
      </NotificationsContext.Provider>
    )

    expect(screen.getByText('Notifications down')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
