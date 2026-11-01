import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AuthContext from '../../context/AuthContext'
import Topbar from './Topbar'

// The bell's dropdown and the school-year chip both come through this module.
// `useFetch(..., { list: true })` expects a bare array, like the real api.list.
vi.mock('../../services/api', () => {
  const api = {
    get: vi.fn(async () => ({ results: [], count: 0 })),
    list: vi.fn(async (path) =>
      path === '/school-years/'
        ? [{ id: 1, label: '2026-2027', is_active: true }]
        : []
    ),
    post: vi.fn(async () => ({})),
    patch: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  }
  return { default: api, ApiError: class ApiError extends Error {} }
})

async function renderTopbar(path) {
  const user = {
    id: 9,
    username: 'ada',
    fullName: 'Ada Admin',
    role: 'admin',
    permissions: ['users.view'],
  }
  const result = render(
    <AuthContext.Provider value={{ user, logout: vi.fn() }}>
      <MemoryRouter initialEntries={[path]}>
        <Topbar onOpenMenu={vi.fn()} notifications={{ data: [], loading: false }} />
      </MemoryRouter>
    </AuthContext.Provider>
  )
  // The school-year request resolves after mount; let it land so no state
  // update leaks past the assertions.
  await screen.findByText('2026-2027')
  return result
}

const breadcrumbNav = () => screen.queryByRole('navigation', { name: 'Breadcrumb' })

describe('Topbar', () => {
  it('names the page and lists only the path above it', async () => {
    await renderTopbar('/admin/students')

    expect(screen.getByText('Students')).toHaveClass('topbar-title')
    const trail = breadcrumbNav()
    expect(trail).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/admin/dashboard'
    )
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute(
      'href',
      '/admin/users'
    )
    // The page itself is the title, not a link to where you already are.
    expect(within(trail).queryByRole('link', { name: 'Students' })).toBeNull()
  })

  it('shows no breadcrumb on a role dashboard', async () => {
    await renderTopbar('/admin/dashboard')
    expect(screen.getByText('Dashboard')).toHaveClass('topbar-title')
    expect(breadcrumbNav()).toBeNull()
  })

  it('shows the school year the screens are scoped to', async () => {
    await renderTopbar('/admin/users')
    expect(screen.getByTitle('Active school year')).toHaveTextContent('2026-2027')
  })
})
