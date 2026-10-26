import InlineLoader from './loading/InlineLoader'
import PageLoader from './loading/PageLoader'

/**
 * Back-compatible entry point for the two indicators that existed before the
 * loading system was consolidated.
 *
 * Every call site keeps working, but the markup now comes from the shared
 * components — new code should import `InlineLoader` / `PageLoader` from
 * `components/loading` directly.
 *
 *   <LoadingSpinner label="…" />          → inline, next to existing content
 *   <LoadingSpinner block label="…" />    → page-level, reserves its own space
 */
export default function LoadingSpinner({
  label = 'Loading…',
  size = 'md',
  block = false,
}) {
  return block ? (
    <PageLoader label={label} size={size} />
  ) : (
    <InlineLoader label={label} size={size} />
  )
}
