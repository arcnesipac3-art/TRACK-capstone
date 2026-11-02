import StatCard from '../StatCard'
import { StatCardSkeleton } from '../loading'
import { dayLabel } from '../../utils/schedules'

/**
 * The four figures a timetable is judged by, counted from the rows already
 * loaded — no counter endpoint exists, and inventing one was not on the table.
 *
 * When the read failed the strip shows em dashes rather than zeros: "0
 * scheduling conflicts" while the request is failing would be the most
 * reassuring number on the page and the least true one.
 */
export default function ScheduleSummary({ stats, loading, failed, today, onToggleConflicts }) {
  if (loading && !stats) {
    return (
      <div className="kpi-grid">
        {[0, 1, 2, 3].map((key) => (
          <StatCardSkeleton key={key} />
        ))}
      </div>
    )
  }

  if (failed || !stats) {
    return (
      <div className="kpi-grid">
        <StatCard label="Scheduled periods" value="—" hint="Could not be counted" icon="calendar" />
        <StatCard label="Classes today" value="—" hint={dayLabel(today)} icon="clock" />
        <StatCard label="Teachers scheduled" value="—" hint="Could not be counted" icon="users" />
        <StatCard
          label="Scheduling conflicts"
          value="—"
          hint="Could not be checked"
          icon="alertTriangle"
        />
      </div>
    )
  }

  const reviewable = stats.conflicts > 0

  return (
    <div className="kpi-grid">
      <StatCard
        label="Scheduled periods"
        value={stats.total}
        hint={
          stats.total
            ? `Across ${stats.days} day${stats.days === 1 ? '' : 's'}`
            : 'Nothing booked yet'
        }
        icon="calendar"
      />
      <StatCard label="Classes today" value={stats.today} hint={dayLabel(today)} icon="clock" />
      <StatCard
        label="Teachers scheduled"
        value={stats.teachers}
        hint={stats.teachers ? 'Named in this timetable' : 'No teacher assigned yet'}
        icon="users"
      />
      {reviewable ? (
        <StatCard
          label="Scheduling conflicts"
          value={stats.conflicts}
          hint="Click to review"
          icon="alertTriangle"
          tone="red"
          onClick={onToggleConflicts}
          aria-label={`${stats.conflicts} scheduling ${
            stats.conflicts === 1 ? 'conflict' : 'conflicts'
          } — activate to review`}
        />
      ) : (
        <StatCard
          label="Scheduling conflicts"
          value={0}
          hint="Every class fits"
          icon="check"
          tone="green"
        />
      )}
    </div>
  )
}
