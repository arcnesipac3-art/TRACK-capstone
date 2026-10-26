import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PublicEnrollPage from './PublicEnrollPage'
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

const RELOAD_PERIODS = vi.fn()

function mockPeriods({ data, loading, error } = {}) {
  useFetch.mockReturnValue({
    data: data ?? null,
    loading: Boolean(loading),
    error: error ?? null,
    reload: RELOAD_PERIODS,
  })
}

function renderPublicEnroll() {
  return render(
    <MemoryRouter initialEntries={['/enroll']}>
      <Routes>
        <Route path="/enroll" element={<PublicEnrollPage />} />
        <Route path="/enroll/apply" element={<div>Application wizard</div>} />
        <Route path="/enroll/track" element={<div>Track page</div>} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PublicEnrollPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders open enrollment periods from the API with the public CTAs', async () => {
    mockPeriods({ data: { count: 1, results: [PERIOD] } })
    renderPublicEnroll()

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /enroll at kiwalan nhs — no account needed to apply/i,
      })
    ).toBeInTheDocument()

    expect(await screen.findByText('First Semester 2026')).toBeInTheDocument()
    expect(screen.getByText('Open', { selector: '.badge' })).toBeInTheDocument()
    // The period card links straight into the wizard with the period preset.
    expect(
      screen.getByRole('link', { name: 'Start an application' })
    ).toHaveAttribute('href', '/enroll/apply?period=3')

    // Hero CTAs.
    expect(
      screen.getByRole('link', { name: 'Start an Application' })
    ).toHaveAttribute('href', '/enroll/apply')
    expect(
      screen.getAllByRole('link', { name: /track my application/i })[0]
    ).toHaveAttribute('href', '/enroll/track')

    // The account-after-confirmation small print, and the sign-in escape hatch.
    expect(
      screen.getAllByText(/you only create an account after your enrollment is confirmed/i)
        .length
    ).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /^sign in$/i })).toHaveAttribute(
      'href',
      '/login'
    )
  })

  it('shows a friendly message when the periods request fails', async () => {
    mockPeriods({ error: { status: 401, message: 'Authentication credentials were not provided.' } })
    renderPublicEnroll()

    expect(
      await screen.findByText(/could not load the enrollment periods right now/i)
    ).toBeInTheDocument()
    // The track CTA still offers a way forward.
    expect(
      screen.getAllByRole('link', { name: /track my application/i })[0]
    ).toHaveAttribute('href', '/enroll/track')
  })

  it('offers the track CTA when no periods are open', async () => {
    mockPeriods({ data: { count: 0, results: [] } })
    renderPublicEnroll()

    expect(await screen.findByText(/no open enrollment periods/i)).toBeInTheDocument()
    expect(
      screen.getAllByRole('link', { name: /track my application/i })[0]
    ).toHaveAttribute('href', '/enroll/track')
  })
})
