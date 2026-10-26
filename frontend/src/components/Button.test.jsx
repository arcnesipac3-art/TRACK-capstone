import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Button from './Button'

/**
 * The button's loading contract: it must block duplicate submissions, tell
 * assistive technology it is busy, and keep an honest label on screen.
 */
describe('Button — loading', () => {
  it('blocks repeat clicks while a request is in flight', () => {
    render(<Button loading>Save</Button>)

    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelector('.btn-spinner')).not.toBeNull()
  })

  it('shows the action-specific label instead of the idle one', () => {
    render(
      <Button loading loadingLabel="Recording payment…">
        Record Payment
      </Button>
    )

    expect(screen.getByText('Recording payment…')).toBeInTheDocument()
    expect(screen.queryByText('Record Payment')).not.toBeInTheDocument()
  })

  it('keeps the idle label when no loading label is supplied', () => {
    render(<Button loading>Save changes</Button>)
    expect(screen.getByText('Save changes')).toBeInTheDocument()
  })

  it('is idle by default', () => {
    render(<Button>Save changes</Button>)

    const button = screen.getByRole('button')
    expect(button).toBeEnabled()
    expect(button).not.toHaveAttribute('aria-busy')
    expect(button.querySelector('.btn-spinner')).toBeNull()
  })
})
