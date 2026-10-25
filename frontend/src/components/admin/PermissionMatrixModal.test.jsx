import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PermissionMatrixModal from './PermissionMatrixModal'
import api from '../../services/api'

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}))

// The dialog asks the auth context whether the matrix may be edited; the
// holder lets each test flip that answer.
const { holder } = vi.hoisted(() => ({ holder: { canFn: () => true } }))
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'ada', role: 'admin', isSuperAdmin: true },
    can: (key) => holder.canFn(key),
  }),
}))

const DEPARTMENT = {
  id: 2,
  name: 'Registrar — Student Records',
  code: 'REGISTRAR',
  is_active: true,
}

const DEFINITIONS = [
  {
    key: 'users.view',
    module: 'users',
    module_label: 'User accounts',
    label: 'View user accounts',
    description: 'List accounts and open account records.',
    position: 1,
  },
  {
    key: 'users.manage',
    module: 'users',
    module_label: 'User accounts',
    label: 'Manage user accounts',
    description: 'Create, edit and deactivate accounts.',
    position: 2,
  },
  {
    key: 'audit.view',
    module: 'audit',
    module_label: 'Audit trail',
    label: 'View audit logs',
    description: 'Read the audit trail.',
    position: 20,
  },
]

function renderModal(props = {}) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(
    <PermissionMatrixModal
      open
      department={DEPARTMENT}
      definitions={DEFINITIONS}
      onClose={onClose}
      onSaved={onSaved}
      {...props}
    />
  )
  return { onClose, onSaved }
}

beforeEach(() => {
  holder.canFn = () => true
})

describe('PermissionMatrixModal', () => {
  it('loads the department’s grants and ticks exactly those permissions', async () => {
    api.get.mockResolvedValue({
      department: DEPARTMENT.id,
      permissions: ['users.view', 'audit.view'],
    })
    renderModal()

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/departments/2/permissions/')
    )
    expect(await screen.findByRole('checkbox', { name: /view user accounts/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /manage user accounts/i })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /view audit logs/i })).toBeChecked()
    // Rows are grouped by module.
    expect(screen.getByText('User accounts')).toBeInTheDocument()
    expect(screen.getByText('Audit trail')).toBeInTheDocument()
  })

  it('PUTs the whole matrix — what you see is what gets saved', async () => {
    api.get.mockResolvedValue({ permissions: ['users.view'] })
    api.put.mockResolvedValue({})
    const user = userEvent.setup()
    const { onSaved, onClose } = renderModal()

    const manageBox = await screen.findByRole('checkbox', { name: /manage user accounts/i })
    await user.click(manageBox)
    await user.click(screen.getByRole('button', { name: /save permissions/i }))

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/departments/2/permissions/', {
        permissions: ['users.view', 'users.manage'],
      })
    )
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onClose).toHaveBeenCalled()
  })

  it('is read-only without the permission key — no ticking, no save button', async () => {
    holder.canFn = () => false
    api.get.mockResolvedValue({ permissions: ['users.view'] })
    renderModal()

    const box = await screen.findByRole('checkbox', { name: /view user accounts/i })
    expect(box).toBeDisabled()
    expect(screen.queryByRole('button', { name: /save permissions/i })).not.toBeInTheDocument()
    // The footer still offers a way out (the × has its own longer label).
    expect(screen.getByRole('button', { name: /^close$/i })).toBeInTheDocument()
  })

  it('surfaces a failed save instead of closing silently', async () => {
    api.get.mockResolvedValue({ permissions: [] })
    api.put.mockRejectedValue(new Error('Permission change rejected.'))
    const user = userEvent.setup()
    const { onSaved, onClose } = renderModal()

    await user.click(await screen.findByRole('button', { name: /save permissions/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/permission change rejected/i)
    )
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
