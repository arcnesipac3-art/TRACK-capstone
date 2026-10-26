/**
 * TRACK loading system — the single source of truth for every asynchronous
 * visual state in the app.
 *
 *   AppLoader      full-screen, branded. Initialisation only (cold boot,
 *                  session restore, session check).
 *   PageLoader     blocking page-level loader when a screen truly has
 *                  nothing to show yet.
 *   InlineLoader   small indicator for one region of an existing screen.
 *   ButtonLoader   decorative spinner inside the control that was clicked.
 *   Skeleton       generic placeholder primitive.
 *   StatCardSkeleton / TableSkeleton / ListSkeleton / CardSkeleton
 *                  layout-matched composites for dashboards and record lists.
 *   RouteTransition subtle cross-fade between routes inside the shell.
 *   BootError      actionable recovery when the session cannot be restored.
 *
 * Loading ≠ empty ≠ error: use `EmptyState` when a request succeeded with no
 * records, and `ErrorMessage` when it failed.
 */
export { default as AppLoader } from './AppLoader'
export { default as BootError } from './BootError'
export { default as ButtonLoader } from './ButtonLoader'
export { default as CardSkeleton } from './CardSkeleton'
export { default as InlineLoader } from './InlineLoader'
export { default as ListSkeleton } from './ListSkeleton'
export { default as PageLoader } from './PageLoader'
export { default as RouteTransition } from './RouteTransition'
export { default as Skeleton } from './Skeleton'
export { default as StatCardSkeleton } from './StatCardSkeleton'
export { default as TableSkeleton } from './TableSkeleton'
