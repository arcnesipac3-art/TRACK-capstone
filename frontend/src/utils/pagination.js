const WINDOW = 5

/**
 * The five page numbers shown around the current page. The window slides to
 * the first or last five near the ends, so the strip is always full width and
 * the current page never sits at an edge.
 */
export function pageWindow(page, totalPages) {
  if (totalPages <= WINDOW) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const start = page <= 3 ? 1 : page >= totalPages - 2 ? totalPages - WINDOW + 1 : page - 2
  return Array.from({ length: WINDOW }, (_, i) => start + i)
}
