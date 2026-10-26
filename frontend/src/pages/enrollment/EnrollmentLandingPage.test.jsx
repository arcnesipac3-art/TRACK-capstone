import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EnrollmentLandingPage from './EnrollmentLandingPage'
import useFetch from '../../hooks/useFetch'

vi.mock('../../hooks/useFetch', () => ({ default: vi.fn() }))

const PERIOD = {
  id: 3,
  name: 'First Semester 2026',
  school_year_label: '2026-2027',
  status: 'open',
  opens_at: '2026-05-01T08:00:00+08:00',
  closes_at: '2026-06-30T17:00:00+08:00',
  is_accepting_applications: true,
}

const APPLICATION = {
  id: 7,
  reference: 'APP-0007',
  status: 'draft',
  grade_level_name: 'Grade 7',
  school_year_label: '2026-2027',
  missing_documents: ['Birth Certificate'],
  submitted_at: null,
}

const RELOAD_APPS = vi.fn()
const RELOAD_PERIODS = vi.fn()

/** Two useFetch calls on this page — keyed by request path. */
function mockUseFetch({ apps, periods }) {
  useFetch.mockImplementation((path) => {
    if (path === '/enrollment/applications/my/') {
      return {
        data: apps.data ?? null,
        loading: Boolean(apps.loading),
        error: apps.error ?? null,
        reload: RELOAD_APPS,
      }
    }
    return {
      data: periods.data ?? null,
      loading: Boolean(periods.loading),
      error: periods.error ?? null,
      reload: RELOAD_PERIODS,
    }
  })
}

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={['/student/enrollment']}>
      <Routes>
        <Route path="/student/enrollment" element={<EnrollmentLandingPage />} />
        <Route
          path="/student/enrollment/new"
          element={<div>New application wizard</div>}
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('EnrollmentLandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows open enrollment periods and my applications', async () => {
    mockUseFetch({
      apps: { data: { count: 1, results: [APPLICATION] } },
      periods: { data: { count: 1, results: [PERIOD] } },
    })
    renderLanding()

    expect(await screen.findByText('First Semester 2026')).toBeInTheDocument()
    expect(screen.getByText('Open', { selector: '.badge' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /start an application/i })
    ).toBeInTheDocument()

    expect(screen.getByText('APP-0007')).toBeInTheDocument()
    expect(screen.getByText('Draft', { selector: '.badge' })).toBeInTheDocument()
    expect(screen.getByText(/1 missing/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^view$/i })).toHaveAttribute(
      'href',
      '/student/enrollment/applications/7'
    )
    expect(
      screen.getByRole('link', { name: /continue draft/i })
    ).toHaveAttribute('href', '/student/enrollment/new?application=7')
  })

  it('starts an application from an open period', async () => {
    const user = userEvent.setup()
    mockUseFetch({
      apps: { data: { count: 0, results: [] } },
      periods: { data: { count: 1, results: [PERIOD] } },
    })
    renderLanding()

    await user.click(
      await screen.findByRole('button', { name: /start an application/i })
    )
    expect(await screen.findByText('New application wizard')).toBeInTheDocument()
  })

  it('shows a retry action when the applications fail to load', async () => {
    const user = userEvent.setup()
    mockUseFetch({
      apps: { error: new Error('Cannot reach the server') },
      periods: { data: { count: 0, results: [] } },
    })
    renderLanding()

    expect(
      await screen.findByText(/could not load your applications/i)
    ).toBeInTheDocument()
    expect(screen.getByText('Cannot reach the server')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(RELOAD_APPS).toHaveBeenCalled()
  })

  it('offers the public apply/track CTAs when the session is unauthorized', async () => {
    const unauthorized = Object.assign(
      new Error('Authentication credentials were not provided.'),
      { status: 401 }
    )
    mockUseFetch({
      apps: { error: unauthorized },
      periods: { data: { count: 0, results: [] } },
    })
    renderLanding()

    expect(
      await screen.findByText(/apply or track without an account/i)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /start an application/i })
    ).toHaveAttribute('href', '/enroll/apply')
    expect(
      screen.getByRole('link', { name: /track my application/i })
    ).toHaveAttribute('href', '/enroll/track')
  })

  it('shows empty states for periods and applications', async () => {
    mockUseFetch({
      apps: { data: { count: 0, results: [] } },
      periods: { data: { count: 0, results: [] } },
    })
    renderLanding()

    expect(await screen.findByText(/no open enrollment periods/i)).toBeInTheDocument()
    expect(await screen.findByText(/no applications yet/i)).toBeInTheDocument()
  })
})
