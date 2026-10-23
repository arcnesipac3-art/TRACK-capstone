import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AuthContext from '../../context/AuthContext'
import Sidebar from './Sidebar'

/**
 * Renders the sidebar as an authenticated administrator holding every admin
 * permission key, starting at `path`. `useAuth` reads the context value
 * directly, so stubbing the provider value is enough — no network involved.
 */
function renderSidebar(path = '/admin/dashboard') {
  const authValue = {
    user: {
      id: 9,
      username: 'ada',
      role: 'admin',
      fullName: 'Ada Admin',
      permissions: [
        'users.view',
        'structure.manage',
        'fees.view',
        'requirements.view',
        'attendance.view',
        'announcements.view',
        'reports.view',
        'departments.view',
        'audit.view',
        'settings.manage',
      ],
    },
    status: 'authenticated',
    isAuthenticated: true,
    isLoading: false,
    bootstrapError: null,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }

  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[path]}>
        <Sidebar />
      </MemoryRouter>
    </AuthContext.Provider>
  )
}

const usersToggle = () => screen.getByRole('button', { name: /users/i })

describe('Sidebar — Users collapsible group', () => {
  it('nests Students, Teachers and Parents under a Users toggle', () => {
    renderSidebar()
    const toggle = usersToggle()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    const panelId = toggle.getAttribute('aria-controls')
    const panel = document.getElementById(panelId)
    expect(panel).toBeInTheDocument()
    expect(panel).not.toHaveClass('open')

    for (const label of ['Students', 'Teachers', 'Parents']) {
      const link = within(panel).getByRole('link', { name: label })
      expect(link).toHaveAttribute('href', `/admin/${label.toLowerCase()}`)
    }
  })

  it('expands and collapses on click without navigating', async () => {
    const user = userEvent.setup()
    renderSidebar()
    const toggle = usersToggle()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(toggle.getAttribute('aria-controls'))).
      toHaveClass('open')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById(toggle.getAttribute('aria-controls'))).
      not.toHaveClass('open')
  })

  it('starts expanded and highlights the active child on a child route', () => {
    renderSidebar('/admin/teachers')
    const toggle = usersToggle()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    const panel = document.getElementById(toggle.getAttribute('aria-controls'))
    expect(within(panel).getByRole('link', { name: 'Teachers' })).
      toHaveClass('active')
    // The parent shows only the subtle child-active cue, never the white pill.
    expect(toggle).toHaveClass('child-active')
    expect(toggle).not.toHaveClass('active')
  })

  it('keeps the submenu expanded while moving between its pages', async () => {
    const user = userEvent.setup()
    renderSidebar('/admin/students')

    await user.click(screen.getByRole('link', { name: 'Parents' }))
    const toggle = usersToggle()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(toggle.getAttribute('aria-controls'))).
      toHaveClass('open')
  })

  it('gives the parent the full active style on its own page only', () => {
    renderSidebar('/admin/users')
    const toggle = usersToggle()
    expect(toggle).toHaveClass('active')
    expect(toggle).not.toHaveClass('child-active')
  })

  it('hides the whole group from an administrator without users.view', () => {
    const authValue = {
      user: { id: 1, username: 'bob', role: 'admin', permissions: [] },
      status: 'authenticated',
      isAuthenticated: true,
      isLoading: false,
      bootstrapError: null,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    }
    render(
      <AuthContext.Provider value={authValue}>
        <MemoryRouter initialEntries={['/admin/dashboard']}>
          <Sidebar />
        </MemoryRouter>
      </AuthContext.Provider>
    )
    expect(screen.queryByRole('button', { name: /users/i })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Students' })).toBeNull()
  })
})
