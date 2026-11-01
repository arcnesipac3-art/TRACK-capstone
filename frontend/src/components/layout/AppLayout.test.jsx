import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuthContext from '../../context/AuthContext'
import AppLayout from './AppLayout'

// The shell and its topbar/bell fetch through this module; this suite is about
// the scope attribute the shell publishes, not about data.
vi.mock('../../hooks/useFetch', () => ({
  default: () => ({ data: [], loading: false, error: null, reload: vi.fn() }),
}))

function renderShell(role, path = `/${role}/dashboard`) {
  const user = {
    id: 1,
    username: role,
    fullName: `${role} tester`,
    role,
    permissions: [],
  }
  return render(
    <AuthContext.Provider value={{ user, logout: vi.fn(), can: () => false }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/:role/dashboard" element={<h1>Screen</h1>} />
            <Route path="/admin/reports" element={<h1>Screen</h1>} />
            <Route path="/notifications" element={<h1>Screen</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  )
}

const shell = () => document.querySelector('.app-shell')

describe('AppLayout — portal scope', () => {
  it.each(['student', 'parent'])(
    'publishes the %s portal scope so the soft surfaces can be styled from CSS',
    (role) => {
      renderShell(role)
      expect(shell()).toHaveAttribute('data-portal', role)
    }
  )

  it.each(['admin', 'teacher'])('gives the %s shell no portal scope', (role) => {
    renderShell(role)
    expect(shell()).not.toHaveAttribute('data-portal')
  })

  it('renders the page inside the scoped shell', () => {
    renderShell('student')
    expect(shell()).toHaveTextContent('Screen')
  })
})

describe('AppLayout — contextual column', () => {
  beforeEach(() => {
    window.localStorage.removeItem('track.context.open')
  })

  const panel = () => document.querySelector('.context-panel')

  it('shows the admin dashboard context inline and marks the shell', () => {
    renderShell('admin')
    expect(panel()).not.toBeNull()
    expect(shell()).toHaveClass('context-open')
    expect(screen.getByRole('complementary')).toHaveAccessibleName(/Today at a glance/)
  })

  it.each(['student', 'parent', 'teacher'])('renders no column on the %s dashboard', (role) => {
    renderShell(role)
    expect(panel()).toBeNull()
    expect(
      screen.queryByRole('button', { name: /context panel/i })
    ).not.toBeInTheDocument()
  })

  it('renders no column on staff routes without context', () => {
    renderShell('admin', '/admin/reports')
    expect(panel()).toBeNull()
  })

  it('collapses from the panel itself, persists, and reopens from the topbar', async () => {
    const user = userEvent.setup()
    renderShell('admin')

    await user.click(screen.getByRole('button', { name: 'Collapse context panel' }))
    expect(panel()).toHaveClass('context-closed')
    expect(panel()).toHaveAttribute('aria-hidden', 'true')
    expect(window.localStorage.getItem('track.context.open')).toBe('0')
    // Content unmounts while collapsed — nothing focusable stays off-screen.
    expect(screen.queryByRole('button', { name: 'Collapse context panel' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show context panel' }))
    expect(panel()).not.toHaveClass('context-closed')
    expect(window.localStorage.getItem('track.context.open')).toBe('1')
  })

  it('starts collapsed when the persisted preference says so', () => {
    window.localStorage.setItem('track.context.open', '0')
    renderShell('admin')
    expect(panel()).toHaveClass('context-closed')
    expect(
      screen.getByRole('button', { name: 'Show context panel' })
    ).toHaveAttribute('aria-expanded', 'false')
  })
})
