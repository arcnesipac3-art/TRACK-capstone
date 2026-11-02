import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SectionsPage from './SectionsPage'
import api from '../services/api'

vi.mock('../services/api', () => {
  const api = {
    get: vi.fn(async () => ({ results: [], count: 0 })),
    list: vi.fn(async () => []),
    post: vi.fn(async () => ({})),
    patch: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  }
  return { api, default: api, ApiError: class ApiError extends Error {} }
})

const SY_CURRENT = {
  id: 3,
  label: '2026-2027',
  start_date: '2026-08-01',
  end_date: '2027-04-30',
  is_active: true,
  section_count: 2,
  subject_count: 9,
}

const SY_PAST = {
  id: 2,
  label: '2025-2026',
  start_date: '2025-08-01',
  end_date: '2026-04-30',
  is_active: false,
  section_count: 0,
  subject_count: 0,
}

const SECTION_A = {
  id: 11,
  name: 'Grade 7 — Sampaguita',
  grade_level_name: 'Grade 7',
  school_year_label: '2026-2027',
  adviser_name: 'Tina Teacher',
  student_count: 38,
}

const SUBJECT_A = {
  id: 21,
  name: 'Mathematics 7',
  code: 'MATH7',
  grade_level_name: 'Grade 7',
  school_year_label: '2026-2027',
  assignment_count: 2,
}

const SCHOOL_YEARS = { '/school-years/': { results: [SY_CURRENT, SY_PAST], count: 2 } }

/**
 * Every tab keeps its own paginated list, so the mock is keyed by endpoint and
 * may answer per-request instead of with one static page.
 */
function mockApi(pages = SCHOOL_YEARS) {
  api.get.mockImplementation(async (path, options) => {
    const entry = pages[path] || { results: [], count: 0 }
    if (entry.reject) throw entry.reject
    const params = options?.params || {}
    return {
      results: typeof entry.results === 'function' ? entry.results(params) : entry.results,
      count: typeof entry.count === 'function' ? entry.count(params) : entry.count,
    }
  })
  api.list.mockResolvedValue([])
}

/** Params of the last request the page sent for one endpoint. */
function lastParams(path) {
  const calls = api.get.mock.calls.filter(([p]) => p === path)
  return calls[calls.length - 1][1].params
}

const renderPage = (pages) => {
  mockApi(pages)
  render(<SectionsPage />)
}

let confirm

beforeEach(() => {
  vi.clearAllMocks()
  confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  confirm.mockRestore()
})

describe('SectionsPage', () => {
  it('opens on school years and asks for the first page at 25 rows', async () => {
    renderPage()

    expect(await screen.findByRole('row', { name: /2026-2027/ })).toBeInTheDocument()
    expect(lastParams('/school-years/')).toMatchObject({ page: 1, page_size: 25 })
  })

  it('marks the current year and leaves the past one plainly neutral', async () => {
    renderPage()

    const current = await screen.findByRole('row', { name: /2026-2027/ })
    expect(within(current).getByText('Current')).toBeInTheDocument()
    expect(within(current).getByText('Aug 1, 2026')).toBeInTheDocument()
    expect(within(current).getAllByText('9')).toHaveLength(1)

    const past = await screen.findByRole('row', { name: /2025-2026/ })
    expect(within(past).getByText('Not current')).toBeInTheDocument()
  })

  it('fills every list on load, then reuses it when the category changes', async () => {
    const user = userEvent.setup()
    renderPage({
      ...SCHOOL_YEARS,
      '/sections/': { results: [SECTION_A], count: 1 },
      '/subjects/': { results: [SUBJECT_A], count: 1 },
    })

    await screen.findByRole('row', { name: /2026-2027/ })
    const before = api.get.mock.calls.filter(([p]) => p === '/sections/').length

    await user.click(screen.getByRole('tab', { name: 'Sections' }))
    expect(await screen.findByRole('row', { name: /Sampaguita/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Sections' })).toHaveAttribute('aria-selected', 'true')
    expect(api.get.mock.calls.filter(([p]) => p === '/sections/').length).toBe(before)
  })

  it('waits for the typing to settle before spending a request on the search', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('row', { name: /2026-2027/ })
    await user.type(screen.getByRole('searchbox', { name: 'Search school years' }), '2026')

    expect(lastParams('/school-years/').search).toBeUndefined()

    // The debounce is a real timer, so the flush has to happen inside act or
    // React reports the resulting render as unhandled.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450))
    })
    expect(lastParams('/school-years/').search).toBe('2026')
  })

  it('narrows the table with the status filter and drops it again', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('row', { name: /2026-2027/ })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'true')
    await vi.waitFor(() => expect(lastParams('/school-years/').is_active).toBe('true'))

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), '')
    await vi.waitFor(() =>
      expect(lastParams('/school-years/').is_active).toBeUndefined()
    )
  })

  it('sorts on the column header and reverses it on the second click', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('row', { name: /2026-2027/ })
    const header = screen.getByRole('columnheader', { name: 'Start date' })

    await user.click(header)
    await vi.waitFor(() => expect(lastParams('/school-years/').ordering).toBe('start_date'))

    await user.click(header)
    await vi.waitFor(() => expect(lastParams('/school-years/').ordering).toBe('-start_date'))
  })

  it('keeps a non-sortable column dead to the click', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('row', { name: /2026-2027/ })
    const before = api.get.mock.calls.length

    await user.click(screen.getByRole('columnheader', { name: 'Sections' }))
    expect(api.get.mock.calls.length).toBe(before)
  })

  it('counts the records and names the slice on screen', async () => {
    renderPage({
      '/school-years/': {
        results: (params) =>
          Array.from({ length: 25 }, (_, i) => ({
            id: i + 1,
            label: `YEAR ${params.page}-${i}`,
            start_date: '2026-08-01',
            end_date: '2027-04-30',
            is_active: false,
            section_count: 0,
            subject_count: 0,
          })),
        count: () => 60,
      },
    })

    expect(await screen.findByText('60 School years')).toBeInTheDocument()
    expect(screen.getByText('Showing 1–25')).toBeInTheDocument()
  })

  it('turns to the next page without losing the filter', async () => {
    const user = userEvent.setup()
    renderPage({
      '/school-years/': {
        results: (params) =>
          Array.from({ length: 25 }, (_, i) => ({
            id: i + 1,
            label: `YEAR ${params.page}-${i}`,
            start_date: '2026-08-01',
            end_date: '2027-04-30',
            is_active: false,
            section_count: 0,
            subject_count: 0,
          })),
        count: () => 60,
      },
    })

    await screen.findByText('YEAR 1-0')
    await user.click(screen.getByRole('button', { name: 'Page 2' }))

    expect(await screen.findByText('YEAR 2-0')).toBeInTheDocument()
    expect(lastParams('/school-years/')).toMatchObject({ page: 2, page_size: 25 })
  })

  it('shows the skeleton until the first page lands', async () => {
    api.get.mockReturnValue(new Promise(() => {}))
    api.list.mockResolvedValue([])
    render(<SectionsPage />)

    expect(document.querySelector('.skeleton')).not.toBeNull()
    expect(screen.queryByRole('table')).toBeNull()

    // The option lists settle on their own; flush them inside act so the
    // render they cause is accounted for.
    await act(async () => {})
  })

  it('names the empty category and tells the registrar what to add', async () => {
    renderPage({ '/school-years/': { results: [], count: 0 } })

    expect(await screen.findByText('No school years')).toBeInTheDocument()
    expect(screen.getByText('Add the first school year, e.g. 2026-2027.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('reports the server’s own reason for a list that will not load', async () => {
    const user = userEvent.setup()
    renderPage({ '/school-years/': { reject: new Error('Structure service is down.') } })

    expect(await screen.findByRole('alert')).toHaveTextContent('Structure service is down.')

    mockApi(SCHOOL_YEARS)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('row', { name: /2026-2027/ })).toBeInTheDocument()
  })

  it('warns about the cascade before deleting a school year, then asks the server', async () => {
    const user = userEvent.setup()
    renderPage()

    const current = await screen.findByRole('row', { name: /2026-2027/ })
    await user.click(within(current).getByRole('button', { name: 'Delete 2026-2027' }))

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Delete school year 2026-2027?'))
    expect(confirm.mock.calls[0][0]).toMatch(/it will also delete every section and subject/)
    expect(confirm.mock.calls[0][0]).toMatch(/This is the current school year/)
    await vi.waitFor(() => expect(api.delete).toHaveBeenCalledWith('/school-years/3/'))
  })

  it('leaves the record alone when the delete is declined', async () => {
    const user = userEvent.setup()
    confirm.mockReturnValue(false)
    renderPage()

    const current = await screen.findByRole('row', { name: /2026-2027/ })
    await user.click(within(current).getByRole('button', { name: 'Delete 2026-2027' }))

    expect(api.delete).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('surfaces the refusal when the server protects a record in use', async () => {
    const user = userEvent.setup()
    renderPage()
    api.delete.mockRejectedValue(
      Object.assign(new Error('Sections still belong to this year.'), { status: 409 })
    )

    const current = await screen.findByRole('row', { name: /2026-2027/ })
    await user.click(within(current).getByRole('button', { name: 'Delete 2026-2027' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Sections still belong to this year.')

    await user.click(within(alert).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('opens the create dialog named for the category on view', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Add school year' }))
    expect(await screen.findByRole('dialog', { name: 'Add school year' })).toBeInTheDocument()
  })
})
