import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UsersPage from './UsersPage'
import AuthContext from '../context/AuthContext'
import api from '../services/api'

vi.mock('../services/api', () => {
  const api = {
    get: vi.fn(async () => ({})),
    list: vi.fn(async () => []),
    post: vi.fn(async () => ({})),
    patch: vi.fn(async () => ({})),
    put: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  }
  return { api, default: api, ApiError: class ApiError extends Error {} }
})

const ME = { id: 2, username: 'ada', full_name: 'Ada Admin', role: 'admin' }

const ADMIN_WITH_DEPT = {
  ...ME,
  is_active: true,
  is_super_admin: false,
  email: 'ada@knhs.edu.ph',
  department_detail: [{ id: 4, name: 'Registrar' }],
}

const ADMIN_SUPER = {
  id: 5,
  username: 'root',
  full_name: 'Ruth Root',
  role: 'admin',
  is_active: true,
  is_super_admin: true,
  email: 'ruth@knhs.edu.ph',
  department_detail: [],
}

const TEACHER = {
  id: 7,
  username: 'teacher1',
  full_name: 'Tina Teacher',
  role: 'teacher',
  is_active: true,
  email: '',
  department_detail: [],
}

const STUDENT = {
  id: 8,
  username: 'learner9',
  // No display name at all: the row has to fall back to the username.
  full_name: null,
  role: 'student',
  is_active: false,
  email: 'learner9@knhs.edu.ph',
  department_detail: [],
}

const DIRECTORY = [ADMIN_WITH_DEPT, ADMIN_SUPER, TEACHER, STUDENT]

function mockUsers(users = DIRECTORY, failure = null) {
  if (failure) api.list.mockRejectedValue(failure)
  else api.list.mockImplementation(async (path) => (path === '/users/' ? users : []))
}

/**
 * `can` is the only thing that decides which actions a row offers, so the
 * permission set is a parameter rather than a fixture.
 */
function renderPage({ role = 'teacher', permissions = [], users, failure } = {}) {
  mockUsers(users, failure)
  const can = vi.fn((key) => permissions.includes(key))
  render(
    <AuthContext.Provider value={{ user: ME, can, signOut: vi.fn() }}>
      <UsersPage role={role} />
    </AuthContext.Provider>
  )
  return { can }
}

const MANAGE = ['users.manage', 'students.manage', 'users.manage_admins']

/** Rows arrive with the fetch, so every lookup waits for its directory. */
const row = (name) => screen.findByRole('row', { name: new RegExp(name, 'i') })

let confirm

beforeEach(() => {
  vi.clearAllMocks()
  confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  confirm.mockRestore()
})

describe('UsersPage', () => {
  it('titles each directory the same way the sidebar names it', async () => {
    renderPage({ role: 'student' })

    expect(screen.getByRole('heading', { level: 1, name: 'Students' })).toBeInTheDocument()
    expect(screen.getByText('Learner accounts on record.')).toBeInTheDocument()
    expect(await row('Tina Teacher')).toBeInTheDocument()
  })

  it('asks the backend only for the role it is showing', async () => {
    renderPage({ role: 'parent' })

    await row('Tina Teacher')
    const call = api.list.mock.calls.find(([path]) => path === '/users/')
    expect(call[1].params).toEqual({ role: 'parent' })
  })

  it('announces the wait before the first row arrives', () => {
    api.list.mockReturnValue(new Promise(() => {}))
    render(
      <AuthContext.Provider value={{ user: ME, can: vi.fn(() => true), signOut: vi.fn() }}>
        <UsersPage role="teacher" />
      </AuthContext.Provider>
    )

    expect(screen.getByRole('status')).toHaveTextContent('Loading accounts')
    expect(document.querySelector('.skeleton')).not.toBeNull()
  })

  it('reports a directory that will not load and retries it', async () => {
    const user = userEvent.setup()
    renderPage({
      permissions: MANAGE,
      failure: Object.assign(new Error('User service unavailable.'), { status: 500 }),
    })

    expect(await screen.findByText('Could not load users')).toBeInTheDocument()
    expect(screen.getByText('User service unavailable.')).toBeInTheDocument()

    api.list.mockImplementation(async (path) => (path === '/users/' ? DIRECTORY : []))
    await user.click(screen.getByRole('button', { name: /try again/i }))

    const teacher = await row('Tina Teacher')
    expect(within(teacher).getByText('Active')).toBeInTheDocument()
  })

  it('says so plainly when the directory is empty', async () => {
    renderPage({ permissions: MANAGE, users: [] })

    expect(await screen.findByText('No accounts')).toBeInTheDocument()
    expect(screen.getByText('No users match this view yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('counts accounts in the header and pluralizes the count', async () => {
    renderPage({ permissions: MANAGE, users: [TEACHER] })

    expect(await screen.findByText('1 account')).toBeInTheDocument()
  })

  it('shows the name, fallback name, status and a dash for a missing email', async () => {
    renderPage({ permissions: MANAGE })

    const me = await row('Ada Admin')
    expect(within(me).getByText(/\(you\)/)).toBeInTheDocument()
    expect(within(me).getByText('ada@knhs.edu.ph')).toBeInTheDocument()
    expect(within(me).getByText('Administrator')).toBeInTheDocument()

    const learner = await row('learner9')
    expect(learner.querySelectorAll('td')[0]).toHaveTextContent('learner9')
    expect(within(learner).getByText('Inactive')).toBeInTheDocument()

    // An empty email is a dash, not a blank cell that reads as a broken row.
    const teacher = await row('Tina Teacher')
    expect(within(teacher).getByText('—')).toBeInTheDocument()
  })

  it('labels administrators by super-admin status and department', async () => {
    renderPage({ permissions: MANAGE })

    const superAdmin = await row('Ruth Root')
    expect(within(superAdmin).getByText('Super Admin')).toBeInTheDocument()
    expect(within(superAdmin).queryByText('No department')).toBeNull()

    const registrar = await row('Ada Admin')
    expect(within(registrar).getByText('Registrar')).toBeInTheDocument()
    expect(within(registrar).queryByText('Super Admin')).toBeNull()
  })

  it('hides every write action from an account that may not write', async () => {
    renderPage({ permissions: ['users.view'] })

    await row('Tina Teacher')
    expect(screen.queryByRole('button', { name: 'Add account' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Deactivate/ })).toBeNull()
  })

  it('gates a row on the key for its own kind of account', async () => {
    // Only student accounts are manageable here, so the teacher and admin rows
    // must not offer buttons the server would refuse anyway.
    renderPage({ permissions: ['students.manage'] })

    const teacher = await row('Tina Teacher')
    const superAdmin = await row('Ruth Root')
    const learner = await row('learner9')

    expect(within(teacher).queryByRole('button', { name: /Edit/ })).toBeNull()
    expect(within(superAdmin).queryByRole('button', { name: /Edit/ })).toBeNull()
    expect(within(learner).getByRole('button', { name: /Edit/ })).toBeInTheDocument()
  })

  it('refuses to let an administrator deactivate their own account', async () => {
    renderPage({ permissions: MANAGE })

    const me = await row('Ada Admin')
    expect(within(me).getByRole('button', { name: /Deactivate/ })).toBeDisabled()
    expect(within(me).getByRole('button', { name: /Deactivate/ })).toHaveAttribute(
      'title',
      'You cannot deactivate your own account.'
    )

    // Everyone else in the same directory stays actionable.
    const teacher = await row('Tina Teacher')
    expect(within(teacher).getByRole('button', { name: /Deactivate/ })).toBeEnabled()
  })

  it('deactivates through the confirm, then refetches the directory', async () => {
    const user = userEvent.setup()
    renderPage({ permissions: MANAGE })

    const teacher = await row('Tina Teacher')
    await user.click(within(teacher).getByRole('button', { name: /Deactivate/ }))

    expect(confirm).toHaveBeenCalledWith('Deactivate Tina Teacher?')
    await vi.waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/users/7/', { is_active: false })
    )
    // One fetch before the write, one after it.
    const calls = api.list.mock.calls.filter(([path]) => path === '/users/')
    expect(calls.length).toBeGreaterThanOrEqual(2)
  })

  it('does nothing when the administrator backs out of the confirm', async () => {
    const user = userEvent.setup()
    confirm.mockReturnValue(false)
    renderPage({ permissions: MANAGE })

    const teacher = await row('Tina Teacher')
    await user.click(within(teacher).getByRole('button', { name: /Deactivate/ }))

    expect(confirm).toHaveBeenCalled()
    expect(api.patch).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it("keeps the server's reason on screen when the write is refused", async () => {
    const user = userEvent.setup()
    renderPage({ permissions: MANAGE })
    api.patch.mockRejectedValue(
      Object.assign(new Error('This account holds the only registrar role.'), { status: 400 })
    )

    const teacher = await row('Tina Teacher')
    await user.click(within(teacher).getByRole('button', { name: /Deactivate/ }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This account holds the only registrar role.')

    await user.click(within(alert).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('opens the create dialog and the password reset for one account', async () => {
    const user = userEvent.setup()
    renderPage({ permissions: MANAGE })

    await user.click(await screen.findByRole('button', { name: 'Add account' }))
    expect(await screen.findByRole('dialog', { name: 'Add an account' })).toBeInTheDocument()

    const teacher = await row('Tina Teacher')
    await user.click(within(teacher).getByRole('button', { name: /Reset password/ }))
    expect(
      await screen.findByRole('dialog', { name: 'Reset password for Tina Teacher' })
    ).toBeInTheDocument()
  })
})
