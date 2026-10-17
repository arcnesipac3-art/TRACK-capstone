import Card, { SummaryRows } from './Card'

/**
 * Attendance summary card built from the backend's attendance aggregate:
 * `{ total_records, by_status: {present, absent, late, excused}, present_rate }`
 */
export default function AttendanceSummaryCard({ attendance, title = 'Attendance summary' }) {
  if (!attendance || attendance.total_records === 0) {
    return (
      <Card title={title}>
        <p className="muted" style={{ fontSize: '0.9rem' }}>
          No attendance has been recorded yet. Records will appear after
          teachers take attendance in class.
        </p>
      </Card>
    )
  }

  const rows = [
    { label: 'Present', value: attendance.by_status.present, tone: 'green' },
    { label: 'Absent', value: attendance.by_status.absent, tone: 'red' },
    { label: 'Late', value: attendance.by_status.late, tone: 'amber' },
    { label: 'Excused', value: attendance.by_status.excused, tone: 'blue' },
  ].map((row) => ({ ...row, total: attendance.total_records, showPercent: true }))

  return (
    <Card
      title={title}
      action={
        <span className="badge badge-blue" title="Share of records marked present">
          {attendance.present_rate !== null
            ? `${attendance.present_rate}% present`
            : `${attendance.total_records} records`}
        </span>
      }
    >
      <SummaryRows rows={rows} />
      <p className="subtle" style={{ marginTop: 10 }}>
        Based on {attendance.total_records} attendance record
        {attendance.total_records === 1 ? '' : 's'} so far.
      </p>
    </Card>
  )
}
