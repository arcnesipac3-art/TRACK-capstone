import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RegistrarReportsPage from './RegistrarReportsPage'
import useFetch from '../../hooks/useFetch'

vi.mock('../../hooks/useFetch', () => ({ default: vi.fn() }))

const SCHOOL_YEARS = [
  { id: 1, label: '2026-2027', is_active: true },
  { id: 2, label: '2027-2028', is_active: false },
]

const REPORT = {
  confirmed_enrollments: 6,
  school_year: { id: 1, label: '2026-2027' },
  by_status: [
    { status: 'accepted', total: 4 },
    { status: 'rejected', total: 2 },
  ],
  by_grade: [{ grade_level_id: 1, grade_level: 'Grade 7', total: 6 }],
  by_type: [{ enrollment_type: 'new', total: 6 }],
  sections: [
    {
      section_id: 10,
      section: 'Sampaguita',
      grade_level: 'Grade 7',
      capacity: 10,
      assigned: 8,
    },
  ],
}

/** The page runs two useFetch calls — keyed by request path. `reportOptions`
 *  collects the options the report fetch was created with so the tests can
 *  assert the default-year gating that used to hide the report body. */
function mockUseFetch({ years, report, reportOptions } = {}) {
  useFetch.mockImplementation((path, options = {}) => {
    if (path === '/school-years/') {
      return {
        data: years ?? SCHOOL_YEARS,
        loading: false,
        error: null,
        reload: vi.fn(),
      }
    }
    if (path === '/enrollment/reports/school-year/') {
      reportOptions?.push(options)
      return {
        data: report?.data ?? null,
        loading: Boolean(report?.loading),
        error: report?.error ?? null,
        reload: vi.fn(),
      }
    }
    return { data: null, loading: false, error: null, reload: vi.fn() }
  })
}

describe('RegistrarReportsPage', () => {
  beforeEach(() => {
    useFetch.mockReset()
  })

  it('shows the report for the defaulted active year with no manual selection', async () => {
    const reportOptions = []
    mockUseFetch({ report: { data: REPORT }, reportOptions })
    render(<RegistrarReportsPage />)

    // The report body appears without the registrar touching the year select.
    expect(
      await screen.findByRole('heading', { name: /by status/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /section occupancy/i })
    ).toBeInTheDocument()
    expect(screen.getByText('Sampaguita')).toBeInTheDocument()
    expect(screen.getByText('Confirmed enrollments')).toBeInTheDocument()
    // No misleading "choose a year" prompt while the default is in effect.
    expect(screen.queryByText(/choose a school year/i)).not.toBeInTheDocument()

    // The fetch ran for the active year (id 1), not unparameterised.
    expect(reportOptions.at(-1)).toMatchObject({
      enabled: true,
      params: { school_year: '1' },
    })
    // …and the select reflects that same default.
    expect(screen.getByLabelText(/school year/i)).toHaveValue('1')
  })

  it('shows a loading skeleton while the report is being built', () => {
    mockUseFetch({ report: { loading: true } })
    render(<RegistrarReportsPage />)

    // The announced skeleton label — role=status has no computed name here,
    // so match on its content (same pattern as the other registrar tests).
    expect(screen.getByRole('status')).toHaveTextContent(/loading report/i)
    expect(
      screen.queryByRole('heading', { name: /by status/i })
    ).not.toBeInTheDocument()
  })

  it('surfaces a failed report with a retry action', async () => {
    mockUseFetch({ report: { error: new Error('Cannot reach the server.') } })
    render(<RegistrarReportsPage />)

    expect(await screen.findByText(/could not build the report/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /by status/i })
    ).not.toBeInTheDocument()
  })

  it('asks for a school year to exist before reporting', async () => {
    mockUseFetch({ years: [] })
    render(<RegistrarReportsPage />)

    expect(await screen.findByText(/no school years yet/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /by status/i })
    ).not.toBeInTheDocument()
  })
})
