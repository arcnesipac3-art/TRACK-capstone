import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

/**
 * Route-level integration test for the code-split build.
 *
 * App.jsx wraps every authenticated page in React.lazy(); these tests render
 * the real <App /> (real router, real AppLayout, real Suspense boundary) and
 * prove that a lazy page chunk actually resolves and renders — both when it
 * is the first route after a hard load and when it is reached by clicking a
 * sidebar link. Only the network layer is canned.
 */

vi.mock('./context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    can: () => true,
    logout: async () => {},
    user: {
      id: 7,
      username: 'parent_one',
      fullName: 'Parent One',
      firstName: 'Parent',
      lastName: 'One',
      email: '',
      role: 'parent',
      isSuperAdmin: false,
      departments: [],
      permissions: [],
    },
  }),
}))

// Mirror the real service's contract: `list()` unwraps to a bare array,
// `get()` returns the parsed body (AnnouncementsPage unwraps `.results`
// itself, and ParentDashboard's useFetch(..., { list: true }) gets arrays).
vi.mock('./services/api', () => {
  const api = {
    get: vi.fn(async (path) => {
      if (path.startsWith('/dashboard')) return { children: [] }
      return { results: [], count: 0 }
    }),
    list: vi.fn(async () => []),
    post: vi.fn(async () => ({})),
    patch: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  }
  return { default: api, ApiError: class ApiError extends Error {} }
})

function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

const mainRegion = () => within(screen.getByRole('main'))

describe('App lazy routes', () => {
  it('resolves the dashboard chunk when it is the first route after load', async () => {
    renderApp('/parent/dashboard')

    expect(
      await mainRegion().findByRole('heading', { name: /Welcome, Parent/ }),
    ).toBeInTheDocument()
    expect(mainRegion().getByText('No linked children yet')).toBeInTheDocument()
  })

  it('fetches and renders a second page chunk on sidebar navigation', async () => {
    const user = userEvent.setup()
    renderApp('/parent/dashboard')
    await mainRegion().findByRole('heading', { name: /Welcome, Parent/ })

    // The shell shows the sidebar nav; clicking Announcements must load its
    // chunk (the page is not in the entry bundle).
    const links = screen.getAllByRole('link', { name: 'Announcements' })
    await user.click(links[0])

    expect(
      await mainRegion().findByRole('heading', { name: 'Announcements' }),
    ).toBeInTheDocument()
  })

  it('loads a lazy page directly from a cold deep link', async () => {
    renderApp('/notifications')

    expect(
      await mainRegion().findByRole('heading', { name: 'Notifications' }),
    ).toBeInTheDocument()
  })
})
