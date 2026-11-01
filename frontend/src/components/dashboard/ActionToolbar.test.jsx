import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ActionToolbar from './ActionToolbar'

const PRIMARY = [
  { label: 'Manage users', to: '/admin/users', icon: 'users' },
  { label: 'View attendance', to: '/admin/attendance', icon: 'calendar' },
]
const MORE = [
  { label: 'Audit logs', to: '/admin/audit-logs', icon: 'clock' },
  { label: 'System settings', to: '/admin/settings', icon: 'settings' },
]

function renderBar(ui) {
  return render(
    <MemoryRouter initialEntries={['/admin/dashboard']}>
      <Routes>
        <Route path="/admin/dashboard" element={ui} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ActionToolbar', () => {
  it('renders the visible shortcuts as links and no menu when nothing overflows', () => {
    renderBar(<ActionToolbar primary={PRIMARY} more={[]} />)

    const bar = screen.getByRole('navigation', { name: 'Quick actions' })
    expect(within(bar).getAllByRole('link')).toHaveLength(2)
    expect(within(bar).getByRole('link', { name: 'Manage users' })).toHaveAttribute(
      'href',
      '/admin/users'
    )
    expect(within(bar).queryByRole('button')).not.toBeInTheDocument()
  })

  it('opens an accessible menu for the overflow and closes on selection', async () => {
    const user = userEvent.setup()
    renderBar(<ActionToolbar primary={PRIMARY} more={MORE} />)

    const trigger = screen.getByRole('button', { name: 'More actions' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    const menu = screen.getByRole('menu', { name: 'More dashboard actions' })
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2)
    expect(within(menu).getByRole('menuitem', { name: 'System settings' })).toHaveAttribute(
      'href',
      '/admin/settings'
    )

    await user.click(within(menu).getByRole('menuitem', { name: 'Audit logs' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('renders nothing when the caller has no permitted shortcuts', () => {
    const { container } = renderBar(<ActionToolbar primary={[]} more={[]} />)
    expect(container.querySelector('nav')).toBeNull()
  })
})
