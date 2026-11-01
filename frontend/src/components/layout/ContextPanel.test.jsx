import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ContextPanel, { PanelSection } from './ContextPanel'

describe('ContextPanel', () => {
  it('renders the title, a labelled complementary region and its content', () => {
    render(
      <ContextPanel title="Enrollment context" onCollapse={vi.fn()}>
        <PanelSection title="Pipeline">
          <p>3 in review</p>
        </PanelSection>
      </ContextPanel>
    )

    expect(screen.getByRole('complementary')).toHaveAccessibleName(
      /Enrollment context/
    )
    expect(screen.getByText('3 in review')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pipeline' })).toBeInTheDocument()
  })

  it('collapses through an accessible control on the inline variant', async () => {
    const onCollapse = vi.fn()
    render(
      <ContextPanel title="Today" onCollapse={onCollapse}>
        <p>content</p>
      </ContextPanel>
    )

    const button = screen.getByRole('button', { name: 'Collapse context panel' })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(button)
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('hides a collapsed inline panel from assistive tech', () => {
    const { container } = render(
      <ContextPanel title="Today" open={false} onCollapse={vi.fn()}>
        {null}
      </ContextPanel>
    )

    const panel = container.querySelector('.context-panel')
    expect(panel).toHaveClass('context-closed')
    expect(panel).toHaveAttribute('aria-hidden', 'true')
    expect(
      container.querySelector('.context-collapse')
    ).toHaveAttribute('tabindex', '-1')
  })

  it('closes the drawer variant with its close button', async () => {
    const onClose = vi.fn()
    const { container } = render(
      <ContextPanel title="Today" variant="drawer" onClose={onClose}>
        <p>content</p>
      </ContextPanel>
    )

    expect(container.querySelector('.context-drawer')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close context panel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
