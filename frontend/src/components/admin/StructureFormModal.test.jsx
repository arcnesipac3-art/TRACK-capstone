import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StructureFormModal from './StructureFormModal'
import api from '../../services/api'

vi.mock('../../services/api', () => ({
  default: { post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const OPTIONS = {
  gradeLevels: [{ id: 1, name: 'Grade 7', order: 7 }],
  schoolYears: [
    { id: 5, label: '2025-2026', is_active: false },
    { id: 6, label: '2026-2027', is_active: true },
  ],
  teachers: [{ id: 2, full_name: 'Tina Teacher' }],
}

function setup(kind, item = null) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(
    <StructureFormModal
      open
      kind={kind}
      item={item}
      options={OPTIONS}
      onClose={onClose}
      onSaved={onSaved}
    />
  )
  return { onClose, onSaved }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('StructureFormModal — section', () => {
  it('offers the grade level and school year pickers', () => {
    setup('section')
    expect(screen.getByLabelText('Grade level')).toBeInTheDocument()
    expect(screen.getByLabelText('School year')).toBeInTheDocument()
    expect(screen.getByLabelText('Adviser (optional)')).toBeInTheDocument()
  })

  it('defaults the school year to the active one', () => {
    setup('section')
    // The active year (2026-2027) is preselected so the admin rarely picks it.
    expect(screen.getByLabelText('School year')).toHaveValue('6')
  })

  it('posts to the kebab-case endpoint', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValue({})
    const { onSaved, onClose } = setup('section')

    await user.type(screen.getByLabelText('Name'), 'Orchid')
    await user.selectOptions(screen.getByLabelText('Grade level'), '1')
    await user.click(screen.getByRole('button', { name: /^Add section$/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post).toHaveBeenCalledWith(
      '/sections/',
      expect.objectContaining({ name: 'Orchid', grade_level: 1, school_year: 6 })
    )
    expect(onSaved).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('blocks submit until a name is entered', async () => {
    const user = userEvent.setup()
    setup('section')
    await user.click(screen.getByRole('button', { name: /^Add section$/ }))
    await waitFor(() =>
      expect(screen.getByText('Enter a name.')).toBeInTheDocument()
    )
    expect(api.post).not.toHaveBeenCalled()
  })

  it('sends no adviser when none is chosen', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValue({})
    setup('section')

    await user.type(screen.getByLabelText('Name'), 'Orchid')
    await user.selectOptions(screen.getByLabelText('Grade level'), '1')
    await user.click(screen.getByRole('button', { name: /^Add section$/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].adviser).toBeNull()
  })
})

describe('StructureFormModal — school year', () => {
  it('shows the school-year fields', () => {
    setup('schoolYear')
    expect(screen.getByLabelText('Label')).toBeInTheDocument()
    expect(screen.getByLabelText('Start date')).toBeInTheDocument()
    expect(screen.getByLabelText('End date')).toBeInTheDocument()
    expect(screen.getByLabelText(/current school year/i)).toBeInTheDocument()
    // No section/subject-only fields leak in.
    expect(screen.queryByLabelText('Grade level')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Adviser (optional)')).not.toBeInTheDocument()
  })

  it('posts to /school-years/, never /schoolYears/', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValue({})
    setup('schoolYear')

    await user.type(screen.getByLabelText('Label'), '2027-2028')
    await user.type(screen.getByLabelText('Start date'), '2027-06-01')
    await user.type(screen.getByLabelText('End date'), '2028-04-01')
    await user.click(screen.getByRole('button', { name: /^Add school year$/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post.mock.calls[0][0]).toBe('/school-years/')
    expect(api.post.mock.calls[0][1]).toEqual({
      label: '2027-2028',
      start_date: '2027-06-01',
      end_date: '2028-04-01',
      is_active: false,
    })
  })

  it('rejects an end date on or before the start date', async () => {
    const user = userEvent.setup()
    setup('schoolYear')

    await user.type(screen.getByLabelText('Label'), '2027-2028')
    await user.type(screen.getByLabelText('Start date'), '2027-06-01')
    await user.type(screen.getByLabelText('End date'), '2027-04-01')
    await user.click(screen.getByRole('button', { name: /^Add school year$/ }))

    await waitFor(() =>
      expect(
        screen.getByText('The end date must be after the start date.')
      ).toBeInTheDocument()
    )
    expect(api.post).not.toHaveBeenCalled()
  })

  it('requires a label', async () => {
    const user = userEvent.setup()
    setup('schoolYear')
    await user.click(screen.getByRole('button', { name: /^Add school year$/ }))
    await waitFor(() =>
      expect(screen.getByText('Enter a label, e.g. 2026-2027.')).toBeInTheDocument()
    )
  })

  it('carries the active flag through when ticked', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValue({})
    setup('schoolYear')

    await user.type(screen.getByLabelText('Label'), '2027-2028')
    await user.type(screen.getByLabelText('Start date'), '2027-06-01')
    await user.type(screen.getByLabelText('End date'), '2028-04-01')
    await user.click(screen.getByLabelText(/current school year/i))
    await user.click(screen.getByRole('button', { name: /^Add school year$/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].is_active).toBe(true)
  })
})

describe('StructureFormModal — grade level', () => {
  it('shows name and sort order', () => {
    setup('gradeLevel')
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Sort order')).toBeInTheDocument()
    expect(screen.queryByLabelText('Grade level')).not.toBeInTheDocument()
  })

  it('posts to /grade-levels/, never /gradeLevels/', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValue({})
    setup('gradeLevel')

    await user.type(screen.getByLabelText('Name'), 'Grade 8')
    await user.type(screen.getByLabelText('Sort order'), '8')
    await user.click(screen.getByRole('button', { name: /^Add grade level$/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post.mock.calls[0][0]).toBe('/grade-levels/')
    expect(api.post.mock.calls[0][1]).toEqual({ name: 'Grade 8', order: 8 })
  })

  it('requires a sort order', async () => {
    const user = userEvent.setup()
    setup('gradeLevel')
    await user.type(screen.getByLabelText('Name'), 'Grade 8')
    await user.click(screen.getByRole('button', { name: /^Add grade level$/ }))
    await waitFor(() =>
      expect(
        screen.getByText('Enter a sort order, e.g. 7.')
      ).toBeInTheDocument()
    )
    expect(api.post).not.toHaveBeenCalled()
  })

  it('rejects a negative sort order', async () => {
    const user = userEvent.setup()
    setup('gradeLevel')
    await user.type(screen.getByLabelText('Name'), 'Grade 8')
    await user.type(screen.getByLabelText('Sort order'), '-3')
    await user.click(screen.getByRole('button', { name: /^Add grade level$/ }))
    await waitFor(() =>
      expect(
        screen.getByText('The sort order must be a whole number of 0 or more.')
      ).toBeInTheDocument()
    )
  })
})

describe('StructureFormModal — edit mode', () => {
  it('patches the record instead of posting a new one', async () => {
    const user = userEvent.setup()
    api.patch.mockResolvedValue({})
    setup('section', { id: 9, name: 'Sampaguita', grade_level: 1, school_year: 6 })

    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Sampaguita Rose')
    await user.click(screen.getByRole('button', { name: /Save changes/i }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
    expect(api.patch).toHaveBeenCalledWith(
      '/sections/9/',
      expect.objectContaining({ name: 'Sampaguita Rose' })
    )
    expect(api.post).not.toHaveBeenCalled()
  })

  it('prefills a school year record and keeps its active flag', () => {
    setup('schoolYear', {
      id: 6,
      label: '2026-2027',
      start_date: '2026-06-01',
      end_date: '2027-04-01',
      is_active: true,
    })
    expect(screen.getByLabelText('Label')).toHaveValue('2026-2027')
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-06-01')
    expect(screen.getByLabelText('End date')).toHaveValue('2027-04-01')
    expect(screen.getByLabelText(/current school year/i)).toBeChecked()
  })

  it('titles itself after the record', () => {
    setup('gradeLevel', { id: 1, name: 'Grade 7', order: 7 })
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Edit grade level Grade 7')
  })
})

describe('StructureFormModal — server errors', () => {
  it('maps a per-field error onto that field', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValue(
      Object.assign(new Error('Bad request'), {
        details: { label: ['A school year with this label already exists.'] },
      })
    )
    setup('schoolYear')

    await user.type(screen.getByLabelText('Label'), '2026-2027')
    await user.type(screen.getByLabelText('Start date'), '2026-06-01')
    await user.type(screen.getByLabelText('End date'), '2027-04-01')
    await user.click(screen.getByRole('button', { name: /^Add school year$/ }))

    await waitFor(() =>
      expect(
        screen.getByText('A school year with this label already exists.')
      ).toBeInTheDocument()
    )
  })

  it('shows a top-level message when the error has no field', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValue(new Error('You do not have permission to do that.'))
    setup('section')

    await user.type(screen.getByLabelText('Name'), 'Orchid')
    await user.selectOptions(screen.getByLabelText('Grade level'), '1')
    await user.click(screen.getByRole('button', { name: /^Add section$/ }))

    await waitFor(() =>
      expect(
        screen.getByRole('alert')
      ).toHaveTextContent('You do not have permission to do that.')
    )
  })
})
