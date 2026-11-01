import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Pagination from './Pagination'
import { pageWindow } from '../utils/pagination'

const base = {
  page: 2,
  totalPages: 4,
  onPage: vi.fn(),
  info: '34 records',
}

describe('Pagination', () => {
  it('shows the caller-supplied summary', () => {
    render(<Pagination {...base} />)
    expect(screen.getByText('34 records')).toBeInTheDocument()
  })

  it('marks the current page and keeps the rest plain', () => {
    render(<Pagination {...base} />)
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('button', { name: 'Page 3' })).not.toHaveAttribute(
      'aria-current'
    )
  })

  it('jumps to the page that was clicked', async () => {
    const onPage = vi.fn()
    render(<Pagination {...base} onPage={onPage} />)
    await userEvent.click(screen.getByRole('button', { name: 'Page 3' }))
    expect(onPage).toHaveBeenCalledWith(3)
  })

  it('disables the arrows at each end of the range', () => {
    const { unmount } = render(<Pagination {...base} page={1} />)
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    unmount()
    render(<Pagination {...base} page={4} />)
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  })

  it('refuses to move while the list is reloading', () => {
    render(<Pagination {...base} loading />)
    expect(screen.getByRole('button', { name: 'Page 3' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  })

  it('only offers the rows-per-page picker when the caller wires it up', async () => {
    const { unmount } = render(<Pagination {...base} />)
    expect(screen.queryByLabelText('Rows per page')).not.toBeInTheDocument()
    unmount()
    const onPageSize = vi.fn()
    render(
      <Pagination
        {...base}
        pageSize={25}
        onPageSize={onPageSize}
        pageSizeOptions={[10, 25]}
        idPrefix="sections"
      />
    )
    const select = screen.getByLabelText('Rows per page')
    expect(select).toHaveValue('25')
    expect(select).toHaveAttribute('id', 'sections-page-size')
    await userEvent.selectOptions(select, '10')
    // Option values arrive as strings; list state keeps them numbers.
    expect(onPageSize).toHaveBeenCalledWith(10)
  })
})

describe('pageWindow', () => {
  it('lists every page when they all fit', () => {
    expect(pageWindow(2, 3)).toEqual([1, 2, 3])
  })

  it('anchors to the start, then slides once the current page moves on', () => {
    expect(pageWindow(1, 12)).toEqual([1, 2, 3, 4, 5])
    expect(pageWindow(3, 12)).toEqual([1, 2, 3, 4, 5])
    expect(pageWindow(6, 12)).toEqual([4, 5, 6, 7, 8])
  })

  it('anchors to the end so the window is never short', () => {
    expect(pageWindow(11, 12)).toEqual([8, 9, 10, 11, 12])
    expect(pageWindow(12, 12)).toEqual([8, 9, 10, 11, 12])
  })
})
