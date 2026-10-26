import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import LoadingSpinner from '../LoadingSpinner'
import AppLoader from './AppLoader'
import BootError from './BootError'
import ButtonLoader from './ButtonLoader'
import CardSkeleton from './CardSkeleton'
import InlineLoader from './InlineLoader'
import ListSkeleton from './ListSkeleton'
import PageLoader from './PageLoader'
import RouteTransition from './RouteTransition'
import Skeleton from './Skeleton'
import StatCardSkeleton from './StatCardSkeleton'
import TableSkeleton from './TableSkeleton'

/**
 * Contract tests for the shared loading system: which state announces itself,
 * which stays decorative, and that placeholders mirror the real layout so the
 * page does not jump when data arrives.
 */
describe('AppLoader', () => {
  it('uses the shipped navy lockup and announces its message', () => {
    render(<AppLoader label="Restoring your session…" />)

    expect(screen.getByAltText('TRACK')).toHaveAttribute('src', '/logo-navy.png')
    expect(screen.getByRole('status')).toHaveTextContent('Restoring your session…')
    // Indeterminate rail — never a fabricated percentage.
    expect(document.querySelector('.app-loader-track')).not.toBeNull()
    expect(document.querySelector('.app-loader-track [style]')).toBeNull()
  })

  it('defaults to a workspace message when none is given', () => {
    render(<AppLoader />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading your workspace…')
  })
})

describe('BootError', () => {
  const base = { message: 'Session check timed out. Please sign in.' }

  it('explains the failure and offers both ways forward', () => {
    render(
      <MemoryRouter>
        <BootError {...base} onRetry={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.getByRole('alert')).toHaveTextContent(base.message)
    expect(
      screen.getByRole('link', { name: /go to sign in/i })
    ).toHaveAttribute('href', '/login')
    expect(screen.getByRole('button', { name: /try again/i })).toBeEnabled()
  })

  it('re-runs the session check when retried', () => {
    const onRetry = vi.fn()
    render(
      <MemoryRouter>
        <BootError {...base} onRetry={onRetry} />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe('PageLoader / InlineLoader', () => {
  it('announces a blocking page load', () => {
    render(<PageLoader label="Loading page…" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading page…')
  })

  it('announces a local, non-blocking load', () => {
    render(<InlineLoader label="Refreshing…" size="sm" />)
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing…')
  })

  it('LoadingSpinner still delegates to the shared components', () => {
    const { rerender } = render(<LoadingSpinner label="One moment…" />)
    expect(screen.getByRole('status')).toHaveTextContent('One moment…')
    expect(document.querySelector('.tr-inline-loader')).not.toBeNull()

    rerender(<LoadingSpinner block label="Loading page…" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading page…')
    expect(document.querySelector('.loading-block')).not.toBeNull()
  })
})

describe('Skeleton', () => {
  it('is decorative and takes explicit dimensions', () => {
    const { container } = render(<Skeleton width="60%" height={12} />)
    const bar = container.querySelector('.skeleton')

    expect(bar).toHaveAttribute('aria-hidden', 'true')
    expect(bar).toHaveStyle({ width: '60%', height: '12px' })
  })

  it('renders a stack of bars for text blocks', () => {
    const { container } = render(<Skeleton lines={3} />)
    expect(container.querySelectorAll('.skeleton-stack .skeleton')).toHaveLength(3)
  })
})

describe('StatCardSkeleton', () => {
  it('is exactly one shimmering card, so dashboard grids keep their shape', () => {
    const { container } = render(<StatCardSkeleton />)
    const cards = container.querySelectorAll('.stat-card.skeleton')

    expect(cards).toHaveLength(1)
    // Nested `.skeleton` elements would break grid counts in the dashboards.
    expect(cards[0].querySelectorAll('.skeleton')).toHaveLength(0)
  })
})

describe('TableSkeleton', () => {
  it('mirrors the column and row count of the real table', () => {
    render(
      <TableSkeleton headers={['Name', 'Role']} rows={4} label="Loading accounts…" />
    )

    expect(screen.getByRole('status')).toHaveTextContent('Loading accounts…')
    expect(document.querySelectorAll('.tr-table-skeleton thead th')).toHaveLength(2)
    expect(document.querySelectorAll('.tr-table-skeleton tbody tr')).toHaveLength(4)
    expect(document.querySelector('.tr-table-skeleton')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
  })

  it('falls back to column-shaped bars when no headings are supplied', () => {
    render(<TableSkeleton columns={3} rows={2} />)
    expect(document.querySelectorAll('.tr-table-skeleton thead th')).toHaveLength(3)
    expect(document.querySelectorAll('.tr-table-skeleton tbody tr')).toHaveLength(2)
  })
})

describe('ListSkeleton', () => {
  it('announces once for the whole placeholder', () => {
    render(<ListSkeleton items={3} lines={2} avatar label="Loading notifications…" />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading notifications…')
    expect(document.querySelectorAll('.tr-list-row')).toHaveLength(3)
    expect(document.querySelectorAll('.sk-bar-avatar')).toHaveLength(3)
  })
})

describe('CardSkeleton', () => {
  it('sits in the real card shell', () => {
    render(<CardSkeleton label="Loading reports…" />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading reports…')
    expect(document.querySelector('section.card')).not.toBeNull()
  })
})

describe('ButtonLoader', () => {
  it('stays out of the accessibility tree', () => {
    const { container } = render(<ButtonLoader />)
    expect(container.querySelector('.btn-spinner')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('RouteTransition', () => {
  it('renders its children inside the wrapper', () => {
    render(
      <MemoryRouter initialEntries={['/announcements']}>
        <RouteTransition>
          <p>page content</p>
        </RouteTransition>
      </MemoryRouter>
    )

    expect(screen.getByText('page content')).toBeInTheDocument()
    expect(document.querySelector('.route-view')).not.toBeNull()
  })
})
