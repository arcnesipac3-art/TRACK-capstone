import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StatusBadge from './StatusBadge'

describe('StatusBadge', () => {
  it('renders its text label', () => {
    render(<StatusBadge label="Verified" />)
    expect(screen.getByText('Verified')).toBeInTheDocument()
  })

  it('applies the tone as a modifier class', () => {
    render(<StatusBadge label="Absent" tone="red" />)
    expect(screen.getByText('Absent')).toHaveClass('badge-red')
  })

  it('defaults to the neutral tone', () => {
    render(<StatusBadge label="Pending" />)
    expect(screen.getByText('Pending')).toHaveClass('badge-neutral')
  })

  it('exposes a title for extra context', () => {
    render(<StatusBadge label="Overdue" title="Was due 3 days ago" />)
    expect(screen.getByText('Overdue')).toHaveAttribute(
      'title',
      'Was due 3 days ago'
    )
  })

  it('never relies on colour alone — the label text is always present', () => {
    // Guards the accessibility rule the design system is built on.
    ;['green', 'amber', 'red', 'blue', 'neutral'].forEach((tone) => {
      const { unmount } = render(
        <StatusBadge label={`State ${tone}`} tone={tone} />
      )
      expect(screen.getByText(`State ${tone}`)).toBeInTheDocument()
      unmount()
    })
  })
})
