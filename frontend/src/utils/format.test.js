import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  attendanceStatus,
  dashboardPath,
  deadlineInfo,
  formatDate,
  formatRelative,
  initials,
  requirementType,
  roleLabel,
  submissionStatus,
} from './format'

describe('formatDate', () => {
  it('formats a real date', () => {
    expect(formatDate('2026-10-18')).toMatch(/Oct/)
    expect(formatDate('2026-10-18')).toMatch(/18/)
    expect(formatDate('2026-10-18')).toMatch(/2026/)
  })

  it('accepts a Date instance', () => {
    expect(formatDate(new Date('2026-01-05'))).toMatch(/Jan/)
  })

  it('falls back to an em dash for missing or invalid input', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('')).toBe('—')
    expect(formatDate('not a date')).toBe('—')
  })
})

describe('formatRelative', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('says "just now" inside the same minute', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T10:00:00'))
    expect(formatRelative('2026-10-18T09:59:50')).toBe('just now')
  })

  it('reports minutes, hours and days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T12:00:00'))
    expect(formatRelative('2026-10-18T11:48:00')).toBe('12 min ago')
    expect(formatRelative('2026-10-18T09:00:00')).toBe('3 hrs ago')
    expect(formatRelative('2026-10-17T12:00:00')).toBe('yesterday')
    expect(formatRelative('2026-10-15T12:00:00')).toBe('3 days ago')
  })

  it('falls back to an absolute date beyond a week', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T12:00:00'))
    expect(formatRelative('2026-10-01T12:00:00')).toMatch(/Oct/)
  })

  it('handles missing values', () => {
    expect(formatRelative(null)).toBe('—')
  })
})

describe('deadlineInfo', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('flags an overdue deadline in red', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T12:00:00'))
    const info = deadlineInfo('2026-10-15T12:00:00')
    expect(info.tone).toBe('red')
    expect(info.label).toBe('Overdue by 3 days')
    expect(info.days).toBe(-3)
  })

  it('flags today and tomorrow in amber', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T12:00:00'))
    expect(deadlineInfo('2026-10-18T18:00:00')).toMatchObject({
      label: 'Due today',
      tone: 'amber',
      days: 0,
    })
    expect(deadlineInfo('2026-10-19T18:00:00')).toMatchObject({
      label: 'Due tomorrow',
      tone: 'amber',
      days: 1,
    })
  })

  it('keeps far-off deadlines neutral', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T12:00:00'))
    expect(deadlineInfo('2026-11-20T12:00:00')).toMatchObject({
      tone: 'neutral',
      days: 33,
    })
  })

  it('handles a missing deadline', () => {
    expect(deadlineInfo(null)).toMatchObject({
      label: 'No deadline set',
      tone: 'neutral',
      days: null,
    })
  })
})

describe('status mappers', () => {
  it('maps every known submission status to a label and tone', () => {
    expect(submissionStatus('verified')).toEqual({
      label: 'Verified',
      tone: 'green',
    })
    expect(submissionStatus('submitted')).toMatchObject({ tone: 'amber' })
    expect(submissionStatus('returned')).toMatchObject({ tone: 'red' })
  })

  it('never returns undefined for an unknown status', () => {
    const info = submissionStatus('invented')
    expect(info.label).toBe('invented')
    expect(info.tone).toBe('neutral')
    expect(submissionStatus(undefined).label).toBe('Unknown')
  })

  it('maps attendance statuses', () => {
    expect(attendanceStatus('present')).toMatchObject({ tone: 'green' })
    expect(attendanceStatus('absent')).toMatchObject({ tone: 'red' })
    expect(attendanceStatus('late')).toMatchObject({ tone: 'amber' })
    expect(attendanceStatus('excused')).toMatchObject({ tone: 'blue' })
    expect(attendanceStatus('nope')).toMatchObject({ tone: 'neutral' })
  })
})

describe('requirementType', () => {
  it('prettifies known types', () => {
    expect(requirementType('performance')).toBe('Performance task')
    expect(requirementType('assignment')).toBe('Assignment')
  })

  it('falls back for unknown types', () => {
    expect(requirementType('mystery')).toBe('Requirement')
    expect(requirementType(undefined)).toBe('Requirement')
  })
})

describe('roleLabel', () => {
  it('expands every role', () => {
    expect(roleLabel('admin')).toBe('Administrator')
    expect(roleLabel('teacher')).toBe('Teacher')
    expect(roleLabel('student')).toBe('Student')
    expect(roleLabel('parent')).toBe('Parent')
  })

  it('falls back to User', () => {
    expect(roleLabel('ghost')).toBe('User')
    expect(roleLabel(undefined)).toBe('User')
  })
})

describe('initials', () => {
  it('takes the first and last initial', () => {
    expect(initials('Juan Dela Cruz')).toBe('JC')
    expect(initials('Maria Clara')).toBe('MC')
  })

  it('handles a single name', () => {
    expect(initials('Madonna')).toBe('M')
  })

  it('collapses extra whitespace', () => {
    expect(initials('  Ana   Maria  Santos ')).toBe('AS')
  })

  it('never throws on empty input', () => {
    expect(initials('')).toBe('?')
    expect(initials(null)).toBe('?')
    expect(initials('   ')).toBe('?')
  })
})

describe('dashboardPath', () => {
  it('builds the role dashboard route', () => {
    expect(dashboardPath('admin')).toBe('/admin/dashboard')
    expect(dashboardPath('parent')).toBe('/parent/dashboard')
  })
})
