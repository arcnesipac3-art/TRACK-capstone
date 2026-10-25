import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import UserFormModal from './UserFormModal'
import api from '../../services/api'

vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    get: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
  },
}))

// The modal reads the signed-in administrator through the auth context — the
// tests stand in for a Super Administrator who holds every permission.
const { mockAuth } = vi.hoisted(() => ({
  mockAuth: {
    user: {
      id: 1,
      username: 'ada',
      role: 'admin',
      fullName: 'Ada Admin',
      isSuperAdmin: true,
      permissions: [],
    },
    can: () => true,
  },
}))
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

const SECTIONS = [
  { id: 1, name: 'Sampaguita', grade_level_name: 'Grade 7', school_year_label: '2026-2027' },
  { id: 2, name: 'Gumamela', grade_level_name: 'Grade 8', school_year_label: '2026-2027' },
]

function setup(props = {}) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(
    <UserFormModal
      open
      sections={SECTIONS}
      onClose={onClose}
      onSaved={onSaved}
      {...props}
    />
  )
  return { onClose, onSaved }
}

describe('UserFormModal — create mode', () => {
  it('shows the create dialog with a student default', () => {
    setup()
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Add an account')
    expect(screen.getByLabelText(/role/i)).toHaveValue('student')
  })

  it('requires an LRN for a new student', async () => {
    const user = userEvent.setup()
    const { onSaved } = setup()

    await user.type(screen.getByLabelText(/first name/i), 'Liza')
    await user.type(screen.getByLabelText(/last name/i), 'Mabini')
    await user.type(screen.getByLabelText(/username/i), 'liza')
    await user.type(screen.getByLabelText(/initial password/i), 'pass-Test1234')

    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(screen.getByText(/learner reference number is required/i)).toBeInTheDocument()
    )
    expect(api.post).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('shows the LRN and section fields only for students', async () => {
    setup()
    expect(screen.getByLabelText(/learner reference number/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^section/i)).toBeInTheDocument()
  })

  it('hides the LRN field for a non-student role', async () => {
    const user = userEvent.setup()
    setup()
    await user.selectOptions(screen.getByLabelText(/role/i), 'teacher')
    expect(
      screen.queryByLabelText(/learner reference number/i)
    ).not.toBeInTheDocument()
  })

  it('asks for the initial password only when creating', async () => {
    setup()
    expect(screen.getByLabelText(/initial password/i)).toBeInTheDocument()
  })
})

describe('UserFormModal — edit mode', () => {
  const existing = {
    id: 5,
    username: 'liza',
    full_name: 'Liza Mabini',
    email: 'liza@knhs.edu.ph',
    first_name: 'Liza',
    middle_name: '',
    last_name: 'Mabini',
    role: 'student',
    lrn: '100000000099',
    section: 1,
    is_active: true,
  }

  it('titles itself after the record and locks the username', () => {
    setup({ user: existing })
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Edit Liza Mabini')
    expect(screen.getByLabelText(/username/i)).toBeDisabled()
  })

  it('does not ask for a password when editing', () => {
    setup({ user: existing })
    expect(screen.queryByLabelText(/initial password/i)).not.toBeInTheDocument()
  })

  it('prefills the record’s values', () => {
    setup({ user: existing })
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Liza')
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Mabini')
    expect(screen.getByLabelText(/learner reference number/i)).toHaveValue(
      '100000000099'
    )
    expect(screen.getByLabelText(/^section/i)).toHaveValue('1')
  })

  it('offers an active-status checkbox when editing', () => {
    setup({ user: existing })
    const box = screen.getByRole('checkbox')
    expect(box).toBeChecked()
  })
})

describe('UserFormModal — parent children linking', () => {
  const parent = {
    id: 9,
    username: 'rosa',
    full_name: 'Rosa Cruz',
    first_name: 'Rosa',
    last_name: 'Cruz',
    role: 'parent',
    children: [3],
    is_active: true,
  }

  it('shows a children picker for parents', async () => {
    setup({ user: parent })
    await waitFor(() =>
      expect(screen.getByLabelText(/linked children/i)).toBeInTheDocument()
    )
  })

  it('loads the student list for the picker', async () => {
    api.list.mockResolvedValue([
      { id: 3, user: { full_name: 'Sofia Cruz' }, section_name: 'G7' },
      { id: 4, user: { full_name: 'Bea Garcia' }, section_name: 'G8' },
    ])
    setup({ user: parent })

    await waitFor(() =>
      expect(screen.getByRole('option', { name: /sofia cruz/i })).toBeInTheDocument()
    )
    expect(screen.getByRole('option', { name: /bea garcia/i })).toBeInTheDocument()
    // The already-linked child is pre-selected.
    expect(screen.getByRole('option', { name: /sofia cruz/i })).toHaveProperty(
      'selected',
      true
    )
  })
})

describe('UserFormModal — submit and errors', () => {
  it('posts a student payload with LRN and section', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValue({ id: 1 })
    const { onSaved, onClose } = setup()

    await user.type(screen.getByLabelText(/first name/i), 'Liza')
    await user.type(screen.getByLabelText(/last name/i), 'Mabini')
    await user.type(screen.getByLabelText(/username/i), 'liza')
    await user.type(screen.getByLabelText(/initial password/i), 'pass-Test1234')
    await user.type(screen.getByLabelText(/learner reference number/i), '100000000099')
    await user.selectOptions(screen.getByLabelText(/^section/i), '2')

    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    const [path, payload] = api.post.mock.calls[0]
    expect(path).toBe('/users/')
    expect(payload).toMatchObject({
      username: 'liza',
      role: 'student',
      lrn: '100000000099',
      section: 2,
      password: 'pass-Test1234',
    })
    expect(onSaved).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('surfaces a server validation error against the field', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValue(
      Object.assign(new Error('Bad request'), {
        details: { lrn: ['This LRN is already in use.'] },
      })
    )
    setup()

    await user.type(screen.getByLabelText(/first name/i), 'Liza')
    await user.type(screen.getByLabelText(/last name/i), 'Mabini')
    await user.type(screen.getByLabelText(/username/i), 'liza2')
    await user.type(screen.getByLabelText(/initial password/i), 'pass-Test1234')
    await user.type(screen.getByLabelText(/learner reference number/i), '100000000001')

    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(screen.getByText(/already in use/i)).toBeInTheDocument()
    )
  })

  it('blocks submit until the required fields are filled', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() =>
      expect(screen.getByText(/enter a username/i)).toBeInTheDocument()
    )
    expect(screen.getByText(/enter the first name/i)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('validates the email format when one is given', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(screen.getByLabelText(/email/i), 'not-an-email')
    await user.type(screen.getByLabelText(/first name/i), 'Liza')
    await user.type(screen.getByLabelText(/last name/i), 'Mabini')
    await user.type(screen.getByLabelText(/username/i), 'liza')
    await user.type(screen.getByLabelText(/initial password/i), 'pass-Test1234')
    await user.type(screen.getByLabelText(/learner reference number/i), '100000000099')

    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(screen.getByText(/valid email/i)).toBeInTheDocument()
    )
  })
})

describe('UserFormModal — administrator assignment', () => {
  const DEPARTMENTS = [
    { id: 2, name: 'Registrar — Student Records', code: 'REGISTRAR', is_active: true },
    { id: 5, name: 'Finance — Fee Management', code: 'FINANCE', is_active: true },
  ]

  async function fillRequired(user) {
    await user.type(screen.getByLabelText(/first name/i), 'Ana')
    await user.type(screen.getByLabelText(/last name/i), 'Santos')
    await user.type(screen.getByLabelText(/username/i), 'ana.santos')
    await user.type(screen.getByLabelText(/initial password/i), 'pass-Test1234')
  }

  it('offers the department list when the role is Administrator', async () => {
    api.list.mockResolvedValue(DEPARTMENTS)
    const user = userEvent.setup()
    setup()
    await user.selectOptions(screen.getByLabelText(/role/i), 'admin')

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /registrar/i })).toBeInTheDocument()
    )
    expect(screen.getByRole('checkbox', { name: /finance/i })).toBeInTheDocument()
    expect(screen.getByText(/holds exactly the permissions/i)).toBeInTheDocument()
  })

  it('requires a department or the super flag for a new administrator', async () => {
    api.list.mockResolvedValue(DEPARTMENTS)
    const user = userEvent.setup()
    const { onSaved } = setup()
    await user.selectOptions(screen.getByLabelText(/role/i), 'admin')
    await fillRequired(user)

    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(screen.getByText(/at least one department/i)).toBeInTheDocument()
    )
    expect(api.post).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('creates an administrator with the picked department and the super flag', async () => {
    api.list.mockResolvedValue(DEPARTMENTS)
    api.post.mockResolvedValue({ id: 42 })
    const user = userEvent.setup()
    const { onSaved, onClose } = setup()
    await user.selectOptions(screen.getByLabelText(/role/i), 'admin')
    await fillRequired(user)
    await user.click(screen.getByRole('checkbox', { name: /registrar/i }))
    await user.click(screen.getByRole('checkbox', { name: /super administrator/i }))

    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    const [path, payload] = api.post.mock.calls[0]
    expect(path).toBe('/users/')
    expect(payload).toMatchObject({
      role: 'admin',
      departments: [2],
      is_super_admin: true,
    })
    expect(onSaved).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
