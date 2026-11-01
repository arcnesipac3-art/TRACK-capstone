import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import Popover from './Popover'

function Menu() {
  return (
    <Popover
      trigger="Open menu"
      triggerLabel="Test menu"
      panelRole="menu"
      panelLabel="Actions"
    >
      {({ close }) => (
        <>
          <button type="button" role="menuitem" onClick={close}>
            First action
          </button>
          <button type="button" role="menuitem">
            Second action
          </button>
        </>
      )}
    </Popover>
  )
}

describe('Popover', () => {
  it('keeps the panel out of the tree until the trigger is used', async () => {
    render(<Menu />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Test menu' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Test menu' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Test menu' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  it('closes when something outside it is pressed', async () => {
    render(
      <div>
        <Menu />
        <p>Elsewhere</p>
      </div>
    )
    await userEvent.click(screen.getByRole('button', { name: 'Test menu' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Elsewhere'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    render(<Menu />)
    await userEvent.click(screen.getByRole('button', { name: 'Test menu' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('lets an item close the panel through the render prop', async () => {
    render(<Menu />)
    await userEvent.click(screen.getByRole('button', { name: 'Test menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'First action' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('stays open when an item that does not close it is used', async () => {
    render(<Menu />)
    await userEvent.click(screen.getByRole('button', { name: 'Test menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Second action' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})
