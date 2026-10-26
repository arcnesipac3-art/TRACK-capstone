import './loading.css'

/** Per-column bar widths so rows read as columns instead of one long bar. */
const CELL_WIDTHS = ['76%', '58%', '68%', '46%', '62%', '50%']

/**
 * Data-table placeholder: same table element, same column count and the same
 * row height as the real list, so filters, headers and pagination stay put
 * while records load.
 *
 * Pass `headers` to reproduce the real column headings (accurate widths) or
 * `columns` for a bare count. `label` is announced once for the whole block —
 * individual bars stay hidden from assistive technology.
 */
export default function TableSkeleton({
  columns = 5,
  rows = 6,
  headers,
  label,
  minWidth,
  responsive = true,
}) {
  const columnCount = Array.isArray(headers) ? headers.length : columns

  return (
    <>
      {label && (
        <span className="sr-only" role="status" aria-live="polite">
          {label}
        </span>
      )}
      <div className="table-wrap tr-table-skeleton" aria-hidden="true">
        <table
          className={`table${responsive ? ' responsive-table' : ''}`}
          style={minWidth ? { minWidth } : undefined}
        >
          <thead>
            <tr>
              {Array.from({ length: columnCount }, (_, c) => (
                <th key={c}>
                  {headers?.[c] ?? (
                    <span
                      className="skeleton skeleton-line"
                      style={{ width: '58%' }}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                {Array.from({ length: columnCount }, (_, c) => (
                  <td key={c}>
                    <span
                      className="skeleton skeleton-line"
                      style={{ width: CELL_WIDTHS[c % CELL_WIDTHS.length] }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
