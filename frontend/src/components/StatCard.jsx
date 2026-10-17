/** Headline metric card used across the four dashboards. */
export default function StatCard({ label, value, hint, tone = 'default' }) {
  return (
    <div className={`stat-card ${tone !== 'default' ? `tone-${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  )
}
