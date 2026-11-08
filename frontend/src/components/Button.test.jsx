import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Button from './Button'
import Icon from './Icon'

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

/**
 * The chromeless-variant contract: a control with no words cannot rely on a
 * ghost background to look pressable, so Button marks icon-only content for the
 * stylesheet instead of leaving each call site to remember it.
 */
describe('Button — icon-only content', () => {
  it('marks a control whose only child is an icon', () => {
    render(
      <Button variant="ghost" aria-label="Previous day">
        <Icon name="chevronLeft" size={16} />
      </Button>
    )

    expect(screen.getByRole('button', { name: 'Previous day' })).toHaveClass('btn-symbol')
  })

  it('leaves a labelled control alone', () => {
    render(
      <Button variant="ghost">
        <Icon name="chevronLeft" size={16} /> Back to Fees
      </Button>
    )

    expect(screen.getByRole('button', { name: 'Back to Fees' })).not.toHaveClass('btn-symbol')
  })

  it('ignores the branch of a conditional child that did not render', () => {
    render(
      <Button variant="ghost" aria-label="Dismiss">
        {null}
        <Icon name="close" size={14} />
      </Button>
    )

    expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveClass('btn-symbol')
  })
})
