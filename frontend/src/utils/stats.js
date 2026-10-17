/** Client-side aggregates derived from records the backend already scoped. */

export function attendanceSummary(records = []) {
  const byStatus = { present: 0, absent: 0, late: 0, excused: 0 }
  records.forEach((record) => {
    if (byStatus[record.status] !== undefined) byStatus[record.status] += 1
  })
  const total = records.length
  return {
    total_records: total,
    by_status: byStatus,
    present_rate: total ? Math.round((100 * byStatus.present) / total) : null,
  }
}

export function countBy(records = [], key = 'status') {
  const counts = {}
  records.forEach((record) => {
    const value = record[key] ?? 'none'
    counts[value] = (counts[value] || 0) + 1
  })
  return counts
}
