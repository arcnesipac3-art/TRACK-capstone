import Button from './Button'
import Icon from './Icon'
import { pageWindow } from '../utils/pagination'

/**
 * Page strip under a paginated table, with the optional rows-per-page picker.
 *
 * `info` is the left-hand summary — the wording differs per module ("12
 * records — showing 1–10", "5 announcements") because each one counts a
 * different thing.
 */
export default function Pagination({
  page,
  totalPages,
  onPage,
  info,
  loading = false,
  pageSize,
  onPageSize,
  pageSizeOptions = [10, 20, 50, 100],
  pageSizeLabel = 'Rows per page',
  idPrefix = 'pagination',
  className = '',
}) {
  return (
    <div className={`pagination${className ? ` ${className}` : ''}`}>
      <div className="pagination-info">{info}</div>
      <div className="pagination-controls">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1 || loading}
          aria-label="Previous page"
        >
          <Icon name="chevronLeft" size={14} />
        </Button>
        <span className="pagination-pages" aria-live="polite">
          {pageWindow(page, totalPages).map((num) => (
            <Button
              key={num}
              variant={num === page ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onPage(num)}
              disabled={loading}
              aria-label={`Page ${num}`}
              aria-current={num === page ? 'page' : undefined}
            >
              {num}
            </Button>
          ))}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages || loading}
          aria-label="Next page"
        >
          <Icon name="chevronRight" size={14} />
        </Button>
        {onPageSize && (
          <div className="pagination-size">
            <label htmlFor={`${idPrefix}-page-size`} className="sr-only">
              {pageSizeLabel}
            </label>
            <select
              id={`${idPrefix}-page-size`}
              className="select select-sm"
              value={pageSize}
              onChange={(event) => onPageSize(Number(event.target.value))}
              disabled={loading}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  )
}
