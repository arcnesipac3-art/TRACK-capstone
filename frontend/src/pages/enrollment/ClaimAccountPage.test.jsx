import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ClaimAccountPage from './ClaimAccountPage'
import AuthContext from '../../context/AuthContext'
import api from '../../services/api'
import useFetch from '../../hooks/useFetch'

vi.mock('../../hooks/useFetch', () => ({ default: vi.fn() }))
vi.mock('../../services/api', () => ({
  default: { claimAccount: vi.fn() },
  API_BASE: '/api',
  authHeader: () => ({}),
  clearGuestToken: vi.fn(),
}))

const TOKEN = 'a'.repeat(32)

function lookup(state) {
  useFetch.mockReturnValue({
    data: null,
    loading: false,
    error: null,
    reload: vi.fn(),
    ...state,
  })
}

function resolved(overrides = {}) {
  return lookup({
    data: {
      reference: 'APP-99B7596CBA',
      learner_name: 'Juan Dela Cruz',
      status: 'enrolled',
      claim_available: true,
      detail: null,
      guardian_name: '',
      guardian_relationship: '',
      guardian_account_exists: false,
      ...overrides,
    },
  })
}

function renderClaim(entry = `/enroll/claim?token=${TOKEN}`) {
  const auth = { user: null, refreshUser: vi.fn().mockResolvedValue(null) }
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/enroll/claim" element={<ClaimAccountPage />} />
          <Route path="/enroll/track" element={<div>Track page</div>} />
          <Route path="/login" element={<div>Sign in page</div>} />
          <Route path="/student/enrollment" element={<div>Student enrollment portal</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  )
  return auth
}

/** The privacy acknowledgement the server requires before it will mint an
 *  account — a claim with an empty box never reaches the endpoint. */
async function acknowledge(user) {
  await user.click(
    screen.getByRole('checkbox', { name: /i have read the privacy notice/i })
  )
}

describe('ClaimAccountPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the credential out of the link before asking for anything', () => {
    resolved()
    renderClaim()

    expect(useFetch).toHaveBeenCalledWith(
      '/enrollment/claim-account/',
      expect.objectContaining({ params: { token: TOKEN }, enabled: true })
    )
    expect(screen.getByRole('heading', { name: /your enrollment is confirmed/i }))
      .toBeInTheDocument()
    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument()
    expect(screen.getByText('APP-99B7596CBA')).toBeInTheDocument()
  })

  it('creates the account with the token from the link and signs the student in', async () => {
    resolved()
    const user = userEvent.setup()
    const auth = renderClaim()
    api.claimAccount.mockResolvedValue({ id: 77, username: 'juandelacruz' })

    await user.type(screen.getByLabelText('Username'), 'juandelacruz')
    await user.type(screen.getByLabelText('Password'), 'Claim-Passw0rd!')
    await user.type(screen.getByLabelText('Confirm password'), 'Claim-Passw0rd!')
    await acknowledge(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(api.claimAccount).toHaveBeenCalledWith({
        claim_token: TOKEN,
        username: 'juandelacruz',
        password: 'Claim-Passw0rd!',
        consent: true,
      })
    )
    expect(auth.refreshUser).toHaveBeenCalled()
    expect(await screen.findByText('Student enrollment portal')).toBeInTheDocument()
  })

  it('does not ask for a credential the link never carried', () => {
    lookup({})
    renderClaim('/enroll/claim')

    expect(useFetch).toHaveBeenCalledWith(
      '/enrollment/claim-account/',
      expect.objectContaining({ enabled: false })
    )
    expect(screen.getByText(/this link is incomplete/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /track my application/i })).toHaveAttribute(
      'href',
      '/enroll/track'
    )
  })

  it('shows the server answer when the link is not valid', async () => {
    lookup({ error: Object.assign(new Error('This account setup link is not valid.'), { status: 404 }) })
    const user = userEvent.setup()
    renderClaim()

    expect(
      await screen.findByText(/this account setup link is not valid/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/written once per enrollment/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(screen.getByRole('link', { name: /track my application/i })).toBeInTheDocument()
  })

  it('points at sign-in when the enrollment needs no new account', async () => {
    resolved({
      claim_available: false,
      detail: 'This enrollment is not confirmed yet, so there is no account to set up.',
    })
    const user = userEvent.setup()
    renderClaim()

    expect(
      screen.getByText(/this enrollment is not confirmed yet/i)
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /^sign in$/i }))
    expect(await screen.findByText('Sign in page')).toBeInTheDocument()
  })

  it('reports which field the server refused', async () => {
    resolved()
    const user = userEvent.setup()
    renderClaim()
    api.claimAccount.mockRejectedValue(
      Object.assign(new Error('username: That username is already taken.'), {
        details: { username: ['That username is already taken.'] },
      })
    )

    await user.type(screen.getByLabelText('Username'), 'taken')
    await user.type(screen.getByLabelText('Password'), 'Claim-Passw0rd!')
    await user.type(screen.getByLabelText('Confirm password'), 'Claim-Passw0rd!')
    await acknowledge(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(
      await screen.findByText(/that username is already taken/i)
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true')
  })

  it('checks the two passwords before spending the link', async () => {
    resolved()
    const user = userEvent.setup()
    renderClaim()

    await user.type(screen.getByLabelText('Username'), 'juandelacruz')
    await user.type(screen.getByLabelText('Password'), 'Claim-Passw0rd!')
    await user.type(screen.getByLabelText('Confirm password'), 'different')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(
      await screen.findByText(/the two passwords do not match/i)
    ).toBeInTheDocument()
    expect(api.claimAccount).not.toHaveBeenCalled()
  })

  it('holds the link unspent until the notice is acknowledged', async () => {
    resolved()
    const user = userEvent.setup()
    renderClaim()
    api.claimAccount.mockResolvedValue({ id: 77, username: 'juandelacruz' })

    await user.type(screen.getByLabelText('Username'), 'juandelacruz')
    await user.type(screen.getByLabelText('Password'), 'Claim-Passw0rd!')
    await user.type(screen.getByLabelText('Confirm password'), 'Claim-Passw0rd!')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(
      await screen.findByText(/confirm that you have read the privacy notice/i)
    ).toBeInTheDocument()
    expect(api.claimAccount).not.toHaveBeenCalled()
  })

  // -- the guardian panel the same link can open -------------------------

  const guardianOnLink = {
    guardian_name: 'Maria Dela Cruz',
    guardian_relationship: 'Mother',
  }

  async function fillLearner(user) {
    await user.type(screen.getByLabelText('Username'), 'juandelacruz')
    await user.type(screen.getByLabelText('Password'), 'Claim-Passw0rd!')
    await user.type(screen.getByLabelText('Confirm password'), 'Claim-Passw0rd!')
    await acknowledge(user)
  }

  it('offers the guardian account the application names', async () => {
    resolved(guardianOnLink)
    renderClaim()

    expect(
      await screen.findByRole('checkbox', {
        name: /also set up an account for mother maria dela cruz/i,
      })
    ).toBeInTheDocument()
    // The panel stays closed until the family asks for it.
    expect(screen.queryByLabelText('Guardian username')).not.toBeInTheDocument()
  })

  it('spends the link on the learner alone when the panel is left closed', async () => {
    resolved(guardianOnLink)
    const user = userEvent.setup()
    renderClaim()
    api.claimAccount.mockResolvedValue({ id: 77, username: 'juandelacruz' })

    await fillLearner(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(api.claimAccount).toHaveBeenCalledWith({
        claim_token: TOKEN,
        username: 'juandelacruz',
        password: 'Claim-Passw0rd!',
        consent: true,
      })
    )
  })

  it('sends both accounts down the one link when the guardian is checked', async () => {
    resolved(guardianOnLink)
    const user = userEvent.setup()
    const auth = renderClaim()
    api.claimAccount.mockResolvedValue({ id: 77, username: 'juandelacruz' })

    await fillLearner(user)
    await user.click(
      screen.getByRole('checkbox', { name: /also set up an account for mother/i })
    )

    // An unfinished pair is caught here, not by a refused link.
    await user.type(screen.getByLabelText('Guardian username'), 'mariadela')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByText('Choose a password.')).toBeInTheDocument()
    expect(api.claimAccount).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Guardian password'), 'Guard-Passw0rd!')
    await user.type(
      screen.getByLabelText('Confirm guardian password'),
      'Guard-Passw0rd!'
    )
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(api.claimAccount).toHaveBeenCalledWith({
        claim_token: TOKEN,
        username: 'juandelacruz',
        password: 'Claim-Passw0rd!',
        consent: true,
        guardian_username: 'mariadela',
        guardian_password: 'Guard-Passw0rd!',
      })
    )
    expect(auth.refreshUser).toHaveBeenCalled()
    expect(await screen.findByText('Student enrollment portal')).toBeInTheDocument()
  })

  it('checks the guardian passwords too before spending the link', async () => {
    resolved(guardianOnLink)
    const user = userEvent.setup()
    renderClaim()

    await fillLearner(user)
    await user.click(
      screen.getByRole('checkbox', { name: /also set up an account for mother/i })
    )
    await user.type(screen.getByLabelText('Guardian username'), 'mariadela')
    await user.type(screen.getByLabelText('Guardian password'), 'Guard-Passw0rd!')
    await user.type(screen.getByLabelText('Confirm guardian password'), 'other')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(api.claimAccount).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Confirm guardian password')).toHaveAttribute(
      'aria-describedby',
      'claim-guardian-confirm-err'
    )
    expect(
      await screen.findByText('The two passwords do not match.')
    ).toBeInTheDocument()
  })

  it('reports which guardian field the server refused', async () => {
    resolved(guardianOnLink)
    const user = userEvent.setup()
    renderClaim()
    api.claimAccount.mockRejectedValue(
      Object.assign(new Error('guardian_username: That username is already taken.'), {
        details: { guardian_username: ['That username is already taken.'] },
      })
    )

    await fillLearner(user)
    await user.click(
      screen.getByRole('checkbox', { name: /also set up an account for mother/i })
    )
    await user.type(screen.getByLabelText('Guardian username'), 'alreadyused')
    await user.type(screen.getByLabelText('Guardian password'), 'Guard-Passw0rd!')
    await user.type(screen.getByLabelText('Confirm guardian password'), 'Guard-Passw0rd!')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(
      await screen.findByText(/that username is already taken/i)
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Guardian username')).toHaveAttribute(
      'aria-invalid',
      'true'
    )
  })

  it('never offers a second guardian account to the parent who applied', async () => {
    resolved({ ...guardianOnLink, guardian_account_exists: true })
    renderClaim()

    await screen.findByRole('heading', { name: /create your account/i })
    expect(
      screen.queryByRole('checkbox', { name: /also set up an account/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Guardian username')).not.toBeInTheDocument()
  })
})
