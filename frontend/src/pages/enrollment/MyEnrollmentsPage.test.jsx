import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MyEnrollmentsPage from './MyEnrollmentsPage'
import useFetch from '../../hooks/useFetch'

vi.mock('../../hooks/useFetch', () => ({ default: vi.fn() }))

const ACTIVE = {
  id: 4,
  school_year_label: '2026-2027',
  grade_level_name: 'Grade 7',
  section_display: '7-Sampaguita',
  status: 'active',
  confirmed_at: '2026-06-01',
}

const WITHDRAWN = {
  id: 5,
  school_year_label: '2025-2026',
  grade_level_name: 'Grade 11',
  section_display: null,
  status: 'withdrawn',
  confirmed_at: null,
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/student/enrollment/history']}>
      <Routes>
        <Route path="/student/enrollment/history" element={<MyEnrollmentsPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('MyEnrollmentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists the enrollments the Registrar confirmed', async () => {
    useFetch.mockReturnValue({
      data: [ACTIVE, WITHDRAWN],
      loading: false,
      error: null,
      reload: vi.fn(),
    })
    renderPage()

    expect(await screen.findByText('2026-2027')).toBeInTheDocument()
    expect(screen.getByText('7-Sampaguita')).toBeInTheDocument()
    expect(screen.getByText('Active', { selector: '.badge' })).toBeInTheDocument()
    expect(screen.getByText('Withdrawn', { selector: '.badge' })).toBeInTheDocument()
    // Missing section and confirmation date read as dashes, not blanks.
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBe(2)
  })

  it('explains why the list is empty', async () => {
    useFetch.mockReturnValue({ data: [], loading: false, error: null, reload: vi.fn() })
    renderPage()

    expect(await screen.findByText(/no confirmed enrollments yet/i)).toBeInTheDocument()
    expect(screen.getByText(/once the registrar confirms/i)).toBeInTheDocument()
  })

  it('retries a failed load', async () => {
    const reload = vi.fn()
    useFetch.mockReturnValue({
      data: null,
      loading: false,
      error: new Error('Cannot reach the server'),
      reload,
    })
    renderPage()

    expect(await screen.findByText(/could not load your enrollments/i)).toBeInTheDocument()
    expect(screen.queryByText(/no confirmed enrollments yet/i)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(reload).toHaveBeenCalled()
  })
})
