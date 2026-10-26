import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PublicTrackPage from './PublicTrackPage'

const GUEST_TOKEN = 'a'.repeat(64)

/** Canned Response for the real api client (no service mock on purpose —
 *  the guest-token save happens inside api.trackApplication). */
function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status < 400,
    status,
    text: async () => JSON.stringify(body),
  }
}

function renderTrack() {
  return render(
    <MemoryRouter initialEntries={['/enroll/track']}>
      <Routes>
        <Route path="/enroll/track" element={<PublicTrackPage />} />
        <Route
          path="/enroll/applications/:id"
          element={<div>Tracked application 12</div>}
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('PublicTrackPage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('tracks an application, saves the guest token and opens the application', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({
        reference: 'APP-1234567890',
        application_id: 12,
        status: 'submitted',
        guest_token: GUEST_TOKEN,
      })
    )
    const user = userEvent.setup()
    renderTrack()

    await user.type(
      await screen.findByLabelText(/application reference/i),
      'APP-1234567890'
    )
    await user.type(
      screen.getByLabelText(/guardian email or contact number/i),
      'rosa@example.com'
    )
    await user.click(screen.getByRole('button', { name: /track my application/i }))

    expect(await screen.findByText('Tracked application 12')).toBeInTheDocument()
    expect(sessionStorage.getItem('track.enrollment.guest')).toBe(GUEST_TOKEN)

    const [url, init] = global.fetch.mock.calls[0]
    expect(url).toContain('/enrollment/public/track/')
    expect(JSON.parse(init.body)).toEqual({
      reference: 'APP-1234567890',
      contact: 'rosa@example.com',
    })
  })

  it('shows the server message when no application matches', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse(
        {
          detail:
            'No public application matched that reference and contact details. Check both entries, or contact the Registrar.',
        },
        { status: 404 }
      )
    )
    const user = userEvent.setup()
    renderTrack()

    await user.type(
      await screen.findByLabelText(/application reference/i),
      'APP-0000000000'
    )
    await user.type(
      screen.getByLabelText(/guardian email or contact number/i),
      'wrong@example.com'
    )
    await user.click(screen.getByRole('button', { name: /track my application/i }))

    expect(
      await screen.findByText(/no public application matched that reference/i)
    ).toBeInTheDocument()
    // Still on the form — nothing was stored or navigated.
    expect(sessionStorage.getItem('track.enrollment.guest')).toBeNull()
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
  })

  it('requires both fields before contacting the server', async () => {
    const user = userEvent.setup()
    renderTrack()

    await user.click(screen.getByRole('button', { name: /track my application/i }))

    expect(await screen.findByText(/enter your application reference/i)).toBeInTheDocument()
    expect(
      screen.getByText(/enter the guardian email or contact number/i)
    ).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
