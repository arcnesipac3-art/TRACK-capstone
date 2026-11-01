import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import AuthContext from '../../context/AuthContext'
import AppLayout from './AppLayout'

// The shell and its topbar/bell fetch through this module; this suite is about
// the scope attribute the shell publishes, not about data.
vi.mock('../../hooks/useFetch', () => ({
  default: () => ({ data: [], loading: false, error: null, reload: vi.fn() }),
}))

function renderShell(role) {
  const user = {
    id: 1,
    username: role,
    fullName: `${role} tester`,
    role,
    permissions: [],
  }
  return render(
    <AuthContext.Provider value={{ user, logout: vi.fn() }}>
      <MemoryRouter initialEntries={[`/${role}/dashboard`]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/:role/dashboard" element={<h1>Screen</h1>} />
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
