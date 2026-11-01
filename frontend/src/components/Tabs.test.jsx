import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Tabs from './Tabs'

const tabs = [
  { id: 'sections', label: 'Sections' },
  { id: 'subjects', label: 'Subjects' },
  { id: 'grade-levels', label: 'Grade levels' },
]

describe('Tabs', () => {
  it('labels the strip and selects the active tab', () => {
    render(<Tabs tabs={tabs} value="subjects" onChange={vi.fn()} label="Categories" />)
    expect(screen.getByRole('tablist', { name: 'Categories' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Subjects' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('tab', { name: 'Sections' })).toHaveAttribute(
      'aria-selected',
      'false'
    )
  })

  it('keeps only the selected tab in the tab order', () => {
    render(<Tabs tabs={tabs} value="sections" onChange={vi.fn()} label="Categories" />)
    expect(screen.getByRole('tab', { name: 'Sections' })).toHaveAttribute('tabIndex', '0')
    expect(screen.getByRole('tab', { name: 'Subjects' })).toHaveAttribute('tabIndex', '-1')
  })

  it('points each tab at the panel it controls', () => {
    render(
      <Tabs
        tabs={tabs}
        value="sections"
        onChange={vi.fn()}
        label="Categories"
        idPrefix="structure"
      />
    )
    expect(screen.getByRole('tab', { name: 'Subjects' })).toHaveAttribute(
      'aria-controls',
      'structure-panel-subjects'
    )
  })

  it('switches on click', async () => {
    const onChange = vi.fn()
    render(<Tabs tabs={tabs} value="sections" onChange={onChange} label="Categories" />)
    await userEvent.click(screen.getByRole('tab', { name: 'Grade levels' }))
    expect(onChange).toHaveBeenCalledWith('grade-levels')
  })

  it('moves the selection with the arrow keys and wraps at both ends', async () => {
    const onChange = vi.fn()
    render(<Tabs tabs={tabs} value="sections" onChange={onChange} label="Categories" />)
    const first = screen.getByRole('tab', { name: 'Sections' })
    first.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('subjects')
    await userEvent.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenLastCalledWith('sections')
    await userEvent.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenLastCalledWith('grade-levels')
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('sections')
    await userEvent.keyboard('{End}')
    expect(onChange).toHaveBeenLastCalledWith('grade-levels')
    await userEvent.keyboard('{Home}')
    expect(onChange).toHaveBeenLastCalledWith('sections')
  })

  it('follows the selection with focus, so the newly active tab is ready', async () => {
    const onChange = vi.fn()
    render(<Tabs tabs={tabs} value="sections" onChange={onChange} label="Categories" />)
    screen.getByRole('tab', { name: 'Sections' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(
      screen.getByRole('tab', { name: 'Subjects' })
    ).toHaveFocus()
  })
})
