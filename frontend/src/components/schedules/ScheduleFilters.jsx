import Button from '../Button'
import Icon from '../Icon'
import { DAYS_OF_WEEK } from '../../utils/schedules'

const FILTERS = [
  { key: 'teacher', list: 'teachers', label: 'Filter by teacher', placeholder: 'All teachers' },
  { key: 'section', list: 'sections', label: 'Filter by section', placeholder: 'All sections' },
  { key: 'subject', list: 'subjects', label: 'Filter by subject', placeholder: 'All subjects' },
  // The day list is the week itself, not something the rows have to mention.
  { key: 'day', list: null, label: 'Filter by day', placeholder: 'All days' },
]

/**
 * The four timetable filters.
 *
 * They narrow the view only: the conflict panel and the KPI strip keep reading
 * every schedule, because a double-booking does not stop existing just because
 * one of its two classes is filtered out.
 */
export default function ScheduleFilters({ options, values, onChange, onClear, disabled }) {
  const active = FILTERS.some((filter) => values[filter.key])

  return (
    <div className="sched-filters">
      {FILTERS.map((filter) => {
        const listId = `filter-${filter.key}`
        return (
          <div className="field" key={filter.key}>
            <label htmlFor={listId} className="sr-only">
              {filter.label}
            </label>
            <select
              id={listId}
              className="select select-sm"
              value={values[filter.key]}
              onChange={(event) => onChange(filter.key, event.target.value)}
              disabled={disabled}
            >
              <option value="">{filter.placeholder}</option>
              {filter.list === null
                ? DAYS_OF_WEEK.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))
                : options[filter.list].map((option) => (
                    <option key={option.id ?? option} value={option.id ?? option}>
                      {option.name ?? option}
                    </option>
                  ))}
            </select>
          </div>
        )
      })}

      {active && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <Icon name="close" size={14} />
          Clear
        </Button>
      )}
    </div>
  )
}
