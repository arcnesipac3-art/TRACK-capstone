/**
 * The subject colour blocks in the timetable.
 *
 * These are not app chrome — they are a categorical data palette, one hue per
 * subject so two classes in adjacent cells read as different things at a
 * glance. The brand scale has six steps and cannot carry fourteen subjects, so
 * this palette lives here, outside the token file, and is consumed by the grid
 * through `--tt-bg` / `--tt-border` / `--tt-text` custom properties.
 *
 * Matching is by substring, which is what lets "General Mathematics" and
 * "Mathematics 10" land on the same colour.
 */
const SUBJECT_COLORS = [
  ['Mathematics', { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' }],
  ['Science', { bg: '#d1fae5', border: '#10b981', text: '#065f46' }],
  ['Physics', { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6' }],
  ['Chemistry', { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' }],
  ['Biology', { bg: '#ccfbf1', border: '#14b8a6', text: '#134e4a' }],
  ['English', { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' }],
  ['Filipino', { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' }],
  ['History', { bg: '#f3e8ff', border: '#a855f7', text: '#6b21a8' }],
  ['Araling Panlipunan', { bg: '#cffafe', border: '#06b6d4', text: '#164e63' }],
  ['Physical Education', { bg: '#ecfccb', border: '#84cc16', text: '#365314' }],
  ['Arts', { bg: '#ffedd5', border: '#f97316', text: '#9a3412' }],
  ['Music', { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' }],
  ['Computer', { bg: '#e0e7ff', border: '#6366f1', text: '#312e81' }],
  ['TLE', { bg: '#ccfbf1', border: '#14b8a6', text: '#134e4a' }],
]

const NEUTRAL = { bg: '#f1f5f9', border: '#64748b', text: '#334155' }

export function subjectColor(subjectName) {
  const name = String(subjectName || '').toLowerCase()
  const found = SUBJECT_COLORS.find(([key]) => name.includes(key.toLowerCase()))
  return found ? found[1] : NEUTRAL
}

/** The three custom properties a card needs; keeps colour out of the markup. */
export function subjectColorVars(subjectName) {
  const colors = subjectColor(subjectName)
  return { '--tt-bg': colors.bg, '--tt-border': colors.border, '--tt-text': colors.text }
}
