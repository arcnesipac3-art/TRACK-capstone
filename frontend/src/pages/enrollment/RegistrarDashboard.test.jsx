import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RegistrarDashboard from './RegistrarDashboard'
import useFetch from '../../hooks/useFetch'

vi.mock('../../hooks/useFetch', () => ({ default: vi.fn() }))

const DASHBOARD = {
  total_applications: 42,
  submitted: 7,
  under_review: 5,
  resubmitted: 2,
  awaiting_corrections: 3,
  accepted: 9,
  waitlisted: 1,
  rejected: 4,
  enrolled: 6,
  drafts: 5,
  pending_documents: 4,
  confirmed_enrollments: 6,
  open_periods: 1,
  by_grade: [
    { grade_level_id: 1, grade_level: 'Grade 7', total: 24 },
    { grade_level_id: 2, grade_level: 'Grade 8', total: 18 },
  ],
}

const SCHOOL_YEARS = [
  { id: 1, label: '2026-2027', is_active: true },
  { id: 2, label: '2027-2028', is_active: false },
]

const SECTIONS = [
  {
    section_id: 10,
    section: 'Sampaguita',
    grade_level: 'Grade 7',
    capacity: 10,
    assigned: 8,
    available: 2,
  },
  {
    section_id: 11,
    section: 'Gumamela',
    grade_level: 'Grade 7',
    capacity: null,
    assigned: 3,
    available: null,
  },
]

function mockUseFetch({ dashboard, dashboardError, dashboardParams } = {}) {
  useFetch.mockImplementation((path, options = {}) => {
    if (path === '/enrollment/dashboard/') {
      dashboardParams?.push(options.params)
      return {
        data: dashboardError ? null : dashboard ?? null,
        loading: false,
        error: dashboardError || null,
        reload: vi.fn(),
      }
    }
    if (path === '/school-years/') {
      return { data: SCHOOL_YEARS, loading: false, error: null, reload: vi.fn() }
    }
    return { data: [], loading: false, error: null, reload: vi.fn() }
  })
}

/** Text of the stat-value inside the card whose label matches. */
function statValue(label) {
  const card = [...document.querySelectorAll('.enr-stat-grid .stat-card')].find(
    (el) => el.querySelector('.stat-label')?.textContent === label
  )
  return card?.querySelector('.stat-value')?.textContent
}

describe('RegistrarDashboard', () => {
  beforeEach(() => {
    useFetch.mockReset()
  })

  it('shows every headline figure from the dashboard payload', async () => {
    mockUseFetch({ dashboard: DASHBOARD })
    render(<RegistrarDashboard />)

    await waitFor(() => expect(statValue('Total applications')).toBe('42'))
    expect(statValue('Submitted')).toBe('7')
    expect(statValue('Under review')).toBe('5')
    expect(statValue('Awaiting corrections')).toBe('3')
    expect(statValue('Accepted')).toBe('9')
    expect(statValue('Enrolled')).toBe('6')
    expect(statValue('Pending document verification')).toBe('4')
    expect(statValue('Confirmed enrollments')).toBe('6')
  })

  it('renders section occupancy and applications by grade level', async () => {
    mockUseFetch({ dashboard: { ...DASHBOARD, sections: SECTIONS } })
    render(<RegistrarDashboard />)

    expect(await screen.findByText('Section occupancy')).toBeInTheDocument()
    expect(screen.getByText('Sampaguita')).toBeInTheDocument()
    expect(screen.getByText('No limit')).toBeInTheDocument()
    expect(screen.getByText('Applications by grade level')).toBeInTheDocument()
    const chart = screen.getByText('Applications by grade level').closest('.card')
    expect(within(chart).getByText('Grade 7')).toBeInTheDocument()
    expect(within(chart).getByText('Grade 8')).toBeInTheDocument()
    expect(within(chart).getByText('24')).toBeInTheDocument()
  })

  it('shows an error with retry instead of zeroed figures when the request fails', async () => {
    mockUseFetch({
      dashboardError: Object.assign(new Error('Cannot reach the server'), {
        status: 0,
      }),
    })
    render(<RegistrarDashboard />)

    expect(
      await screen.findByText(/could not load the registrar dashboard/i)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
    // Never fabricate zeros while the request has failed.
    expect(document.querySelector('.enr-stat-grid')).toBeNull()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('passes the chosen school year to the dashboard request', async () => {
    const seen = []
    mockUseFetch({ dashboard: DASHBOARD, dashboardParams: seen })
    const user = userEvent.setup()
    render(<RegistrarDashboard />)

    const select = await screen.findByLabelText(/school year/i)
    await user.selectOptions(select, '2')

    await waitFor(() =>
      expect(
        seen.some((params) => params && params.school_year === '2')
      ).toBe(true)
    )
  })
})
