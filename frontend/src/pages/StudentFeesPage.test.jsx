import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StudentFeesPage from './StudentFeesPage'
import { api, ApiError } from '../services/api'

vi.mock('../services/api', () => {
  const api = { get: vi.fn(async () => []), list: vi.fn(async () => []) }
  return { api, default: api, ApiError: class ApiError extends Error {} }
})

const FEE = (id, overrides = {}) => ({
  id,
  category: 'Maintenance Fee',
  description: 'Per quarter',
  category_fee_type: 'required',
  amount: 1000,
  paid_amount: 0,
  outstanding: 1000,
  payment_status: 'unpaid',
  due_date: '2026-09-30',
  receipt_number: null,
  ...overrides,
})

const SUMMARY = {
  total_assessed: 8900,
  total_paid: 4000,
  total_outstanding: 4900,
  assessments: [
    FEE(1, { category: 'Premium Tuition', payment_status: 'paid', paid_amount: 1000, outstanding: 0, receipt_number: 'RCPT-004' }),
    FEE(2, { category: 'Book Fee', due_date: '2026-06-01' }),
    FEE(3, { category: 'Science FEAST', payment_status: 'partial', paid_amount: 400, outstanding: 600, due_date: '2026-07-01' }),
  ],
}

const SCHOOL_YEARS = [
  { id: 1, label: '2026-2027', is_active: true },
  { id: 2, label: '2025-2026', is_active: false },
]

/** The page re-fetches once it seeds the active year, so both passes answer. */
function mockApi({ rows = [SUMMARY], schoolYears = SCHOOL_YEARS, failure = null } = {}) {
  api.get.mockImplementation(async (path, options) => {
    if (failure) throw failure
    const year = options?.params?.school_year
    return year === undefined || String(year) === '1' ? rows : []
  })
  api.list.mockResolvedValue(schoolYears)
}

async function renderPage(options = {}) {
  mockApi(options)
  render(<StudentFeesPage />)
  return screen.findByRole('heading', { level: 1, name: 'My Fees' })
}

const feesPanel = () =>
  screen.getByRole('heading', { level: 2, name: 'Fee Assessments' }).closest('section')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('StudentFeesPage', () => {
  it('shows the totals as icon metrics, then the table to the card edge', async () => {
    await renderPage()

    expect(screen.getByText('₱4,900.00 outstanding')).toBeInTheDocument()
    expect(document.querySelectorAll('.grid .stat-card .stat-icon')).toHaveLength(3)

    const panel = feesPanel()
    expect(panel.querySelector('.card-body').className).toContain('flush')
    expect(within(panel).getAllByRole('row').slice(1)).toHaveLength(3)

    // Unpaid first, then partial, then paid.
    const categories = [...panel.querySelectorAll('tbody tr td:first-child strong')].map(
      (el) => el.textContent,
    )
    expect(categories).toEqual(['Book Fee', 'Science FEAST', 'Premium Tuition'])
    expect(within(panel).getByText('RCPT-004')).toBeInTheDocument()
  })

  it('pads the body back for the empty state when the period has no assessments', async () => {
    await renderPage({ rows: [{ ...SUMMARY, assessments: [] }] })

    expect(screen.getByText('No assessments')).toBeInTheDocument()
    expect(feesPanel().querySelector('.card-body').className).not.toContain('flush')
    expect(within(feesPanel()).queryByRole('table')).toBeNull()
  })

  it('offers one honest empty card when nothing is published at all', async () => {
    await renderPage({ rows: [] })

    expect(screen.getByText('No fee data')).toBeInTheDocument()
    expect(screen.getByText(/Your fee assessments will appear here/)).toBeInTheDocument()
    expect(document.querySelectorAll('.card')).toHaveLength(1)
  })

  it('asks the backend for the year the student picks', async () => {
    const user = userEvent.setup()
    await renderPage()

    await user.selectOptions(screen.getByRole('combobox', { name: 'School Year' }), '2')
    await vi.waitFor(() => expect(screen.getByText('No fee data')).toBeInTheDocument())

    const years = api.get.mock.calls.map(([, options]) => options?.params?.school_year)
    expect(years).toEqual([undefined, 1, '2'])
  })

  it('hides the year picker when there is only one year to choose', async () => {
    await renderPage({ schoolYears: [{ id: 1, label: '2026-2027', is_active: true }] })

    expect(screen.queryByRole('combobox', { name: 'School Year' })).toBeNull()
  })

  it('reports a failed summary and recovers on retry', async () => {
    const user = userEvent.setup()
    await renderPage({ failure: new ApiError('Fee service unavailable') })

    expect(screen.getByText('Fee service unavailable')).toBeInTheDocument()
    expect(screen.queryByText('No fee data')).not.toBeInTheDocument()

    api.get.mockResolvedValue([SUMMARY])
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Fee Assessments' })).toBeInTheDocument()
  })

  it('announces loading before the figures arrive', () => {
    mockApi()
    api.get.mockReturnValue(new Promise(() => {}))
    api.list.mockReturnValue(new Promise(() => {}))
    render(<StudentFeesPage />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading fee summary')
    expect(document.querySelectorAll('.grid .skeleton')).toHaveLength(3)
  })
})
