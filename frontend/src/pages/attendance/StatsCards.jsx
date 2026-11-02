import StatCard from '../../components/StatCard'
import { dashboardCards } from '../../utils/attendance'

/**
 * The four headline figures of the attendance dashboard.
 *
 * The values arrive from `useServerCounts` — four filtered count reads defined
 * beside the other query builders in `utils/attendance.js` — so the strip is
 * honest for a teacher with four school years of registers, not just one page.
 */
export default function StatsCards({ counts, loading }) {
  const cards = dashboardCards({
    todayCount: counts.todayCount ?? 0,
    completedCount: counts.completedCount ?? 0,
    pendingCount: counts.pendingCount ?? 0,
    studentCount: counts.studentCount ?? 0,
  })

  return (
    <div
      className="kpi-grid att-stats"
      role="group"
      aria-label="Attendance summary"
      aria-busy={loading ? 'true' : 'false'}
    >
      {cards.map((card) => (
        <StatCard
          key={card.id}
          label={card.label}
          value={loading && counts[card.id] === undefined ? '—' : card.value}
          hint={card.hint}
          tone={card.tone}
          icon={card.icon}
        />
      ))}
    </div>
  )
}
