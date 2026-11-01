import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ParentFeesPage from './ParentFeesPage'
import { api, ApiError } from '../services/api'

vi.mock('../services/api', () => {
  const api = {
    get: vi.fn(async () => []),
    list: vi.fn(async () => []),
  }
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

const SOFIA = {
  id: 1,
  user: { full_name: 'Sofia Cruz' },
  lrn: '123456789001',
  section_name: 'Grade 7 — Sampaguita (2026-2027)',
  total_assessed: 8900,
  total_paid: 4000,
  total_outstanding: 4900,
  assessments: [
    FEE(11, {
      category: 'Premium Tuition',
      payment_status: 'paid',
      paid_amount: 1000,
      outstanding: 0,
      receipt_number: 'RCPT-004',
      due_date: '2026-08-01',
    }),
    FEE(12, {
      category: 'Science FEAST',
      category_fee_type: 'voluntary',
      payment_status: 'partial',
      paid_amount: 400,
      outstanding: 600,
      due_date: '2026-07-01',
    }),
    FEE(13, { category: 'Book Fee', due_date: '2026-06-01' }),
  ],
}

const MIGUEL = {
  id: 2,
  user: { full_name: 'Miguel Torres' },
  lrn: null,
  section_name: null,
  total_assessed: 0,
  total_paid: 0,
  total_outstanding: 0,
  assessments: [],
}

const SCHOOL_YEARS = [
  { id: 1, label: '2026-2027', is_active: true },
  { id: 2, label: '2025-2026', is_active: false },
]

/**
 * `school_year` is empty on the first pass and carries the active year on the
 * re-fetch that follows, so both must answer with `summaries`.
 */
function mockApi({ summaries = [SOFIA, MIGUEL], schoolYears = SCHOOL_YEARS, failure = null } = {}) {
  api.get.mockImplementation(async (path, options) => {
    if (failure) throw failure
    const year = options?.params?.school_year
    return year === undefined || String(year) === '1' ? summaries : []
  })
  api.list.mockResolvedValue(schoolYears)
}

/** The page loads on a microtask, so each case waits for its heading first. */
async function renderPage(options = {}) {
  mockApi(options)
  render(<ParentFeesPage />)
  return screen.findByRole('heading', { level: 1, name: "Children's Fees" })
}

function childPanel(name) {
  return screen.getByRole('heading', { level: 2, name }).closest('section')
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ParentFeesPage', () => {
  it('summarizes each child, then runs their table to the card edge', async () => {
    await renderPage()

    const panel = childPanel('Sofia Cruz')
    const body = panel.querySelector('.card-body')
    expect(body.className).toContain('flush')

    // A flush body carries no padding of its own, so the totals block does.
    const totals = body.querySelector('.card-pad')
    expect(totals.className).toContain('stack')
    expect(
      within(totals).getByText('Grade 7 — Sampaguita (2026-2027) · LRN: 123456789001'),
    ).toBeInTheDocument()
    expect(within(totals).getByText('₱8,900.00')).toBeInTheDocument()
    expect(within(totals).getByText('₱4,000.00')).toBeInTheDocument()
    expect(within(totals).getByText('₱4,900.00')).toBeInTheDocument()
    expect(totals.querySelectorAll('.stat-card .stat-icon')).toHaveLength(3)

    expect(within(panel).getAllByRole('row').slice(1)).toHaveLength(3)
    expect(within(panel).getByText('Voluntary')).toBeInTheDocument()
    expect(within(panel).getByText('RCPT-004')).toBeInTheDocument()
  })

  it('puts the oldest unpaid balance first so the pressing fee is the top row', async () => {
    await renderPage()

    const panel = childPanel('Sofia Cruz')
    const categories = [...panel.querySelectorAll('tbody tr td:first-child strong')].map(
      (el) => el.textContent,
    )
    expect(categories).toEqual(['Book Fee', 'Science FEAST', 'Premium Tuition'])

    // A settled fee is not shouted about; an open balance is.
    expect(panel.querySelector('tbody tr td:nth-child(6) strong')).toHaveTextContent('₱1,000.00')
    expect(within(panel).getAllByText('—')).toHaveLength(2)
  })

  it('keeps the body padding around a child with nothing assessed', async () => {
    await renderPage()

    const panel = childPanel('Miguel Torres')
    const body = panel.querySelector('.card-body')
    expect(body.className).not.toContain('flush')
    expect(body.querySelector('.card-pad')).toBeNull()

    expect(within(body).getByText('No section · LRN: N/A')).toBeInTheDocument()
    expect(within(body).getByText('No assessments')).toBeInTheDocument()
    expect(within(panel).queryByText('RCPT-004')).not.toBeInTheDocument()
  })

  it('offers one honest empty state when no child has fee data', async () => {
    await renderPage({ summaries: [] })

    expect(screen.getByText('No fee data')).toBeInTheDocument()
    expect(screen.getByText(/will appear here once published/)).toBeInTheDocument()
    expect(document.querySelectorAll('.card')).toHaveLength(1)
  })

  it('lets the parent pick another school year and asks the backend for it', async () => {
    const user = userEvent.setup()
    await renderPage()

    const select = screen.getByRole('combobox', { name: 'School Year' })
    expect(select).toHaveValue('1')

    await user.selectOptions(select, '2')
    await vi.waitFor(() => {
      expect(screen.getByText('No fee data')).toBeInTheDocument()
    })

    // The active year is seeded from the payload (a number), the picked one
    // arrives from the select (a string) — both serialize the same in the URL.
    const years = api.get.mock.calls.map(([, options]) => options?.params?.school_year)
    expect(years).toEqual([undefined, 1, '2'])
  })

  it('hides the year picker when the school has only one year', async () => {
    await renderPage({ schoolYears: [{ id: 1, label: '2026-2027', is_active: true }] })

    expect(screen.queryByRole('combobox', { name: 'School Year' })).toBeNull()
  })

  it('reports a failed fee request and recovers on retry', async () => {
    const user = userEvent.setup()
    await renderPage({ failure: new ApiError('Fee service unavailable') })

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Fee service unavailable')).toBeInTheDocument()
    expect(screen.queryByText('No fee data')).not.toBeInTheDocument()

    api.get.mockResolvedValue([SOFIA])
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Sofia Cruz' })).toBeInTheDocument()
  })

  it('announces the loading state before the data lands', () => {
    mockApi()
    api.get.mockReturnValue(new Promise(() => {}))
    api.list.mockReturnValue(new Promise(() => {}))
    render(<ParentFeesPage />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading fee summaries')
    expect(document.querySelector('.skeleton')).not.toBeNull()
  })
})
