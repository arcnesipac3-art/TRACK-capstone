import { describe, expect, it } from 'vitest'
import {
  MOBILE_PRIMARY,
  NAVIGATION,
  mobileItemsForRole,
  navForRole,
  navForUser,
  titleForPath,
} from './navigation'

const ROLES = ['admin', 'teacher', 'student', 'parent']

describe('NAVIGATION', () => {
  it('defines navigation for all four roles', () => {
    ROLES.forEach((role) => {
      expect(Array.isArray(NAVIGATION[role])).toBe(true)
      expect(NAVIGATION[role].length).toBeGreaterThan(0)
    })
  })

  it('starts every enabled item with a route', () => {
    ROLES.forEach((role) => {
      NAVIGATION[role].forEach((item) => {
        if (item.enabled === false) {
          // Placeholders must NOT pretend to be links.
          expect(item.to).toBeUndefined()
        } else {
          expect(item.to).toMatch(/^\//)
        }
        expect(item.label).toBeTruthy()
      })
    })
  })

  it('never renders a disabled item as a fake link', () => {
    const disabled = ROLES.flatMap((role) =>
      NAVIGATION[role].filter((i) => i.enabled === false)
    )
    expect(disabled.length).toBeGreaterThan(0)
    disabled.forEach((item) => expect(item.to).toBeUndefined())
  })

  it('uses unique routes within each role so active-state matching is unambiguous', () => {
    ROLES.forEach((role) => {
      const tos = NAVIGATION[role].filter((i) => i.to).map((i) => i.to)
      expect(new Set(tos).size).toBe(tos.length)
    })
  })
})

describe('navForRole', () => {
  it('returns that role’s items', () => {
    expect(navForRole('teacher')).toBe(NAVIGATION.teacher)
    expect(navForRole('student')).toContainEqual(
      expect.objectContaining({ to: '/student/requirements' })
    )
  })

  it('returns an empty list for an unknown role instead of throwing', () => {
    expect(navForRole('robot')).toEqual([])
    expect(navForRole(undefined)).toEqual([])
  })
})

describe('navForUser', () => {
  const adminWith = (permissions) => ({ role: 'admin', permissions })

  it('shows an administrator only the pages their permissions unlock', () => {
    const tos = navForUser(adminWith(['users.view'])).map((i) => i.to)
    expect(tos).toContain('/admin/users')
    expect(tos).not.toContain('/admin/fees')
    expect(tos).not.toContain('/admin/departments')
    expect(tos).not.toContain('/admin/audit-logs')
  })

  it('keeps Dashboard and Notifications visible for every administrator', () => {
    expect(navForUser(adminWith([])).map((i) => i.to)).toEqual([
      '/admin/dashboard',
      '/notifications',
    ])
  })

  it('shows every page to a super administrator, who holds every key', () => {
    const allAdminKeys = [
      'users.view',
      'structure.manage',
      'fees.view',
      'requirements.view',
      'attendance.view',
      'announcements.view',
      'reports.view',
      'departments.view',
      'audit.view',
      'settings.manage',
      'enrollment.view',
    ]
    expect(new Set(navForUser(adminWith(allAdminKeys)).map((i) => i.to))).
      toEqual(new Set(NAVIGATION.admin.map((i) => i.to)))
  })

  it('nests the user directories under the Users group', () => {
    const users = navForUser(adminWith(['users.view'])).find(
      (i) => i.label === 'Users'
    )
    expect(users.children.map((c) => c.to)).toEqual([
      '/admin/students',
      '/admin/teachers',
      '/admin/parents',
    ])
    // …and only as children, never duplicated at the top level.
    const tos = navForUser(adminWith(['users.view'])).map((i) => i.to)
    expect(tos).not.toContain('/admin/students')
    expect(tos).not.toContain('/admin/teachers')
    expect(tos).not.toContain('/admin/parents')
  })

  it('drops the whole Users group when users.view is missing', () => {
    const items = navForUser(adminWith([]))
    expect(items.some((i) => i.label === 'Users')).toBe(false)
    expect(items.some((i) => i.children?.length)).toBe(false)
  })

  it('leaves non-administrator roles untouched — their nav is role-scoped', () => {
    expect(navForUser({ role: 'teacher', permissions: [] })).toBe(NAVIGATION.teacher)
    expect(navForUser({ role: 'student' })).toBe(NAVIGATION.student)
  })

  it('falls back to an empty list for unknown users instead of throwing', () => {
    expect(navForUser(undefined)).toEqual([])
    expect(navForUser({})).toEqual([])
  })
})

describe('mobileItemsForRole', () => {
  it('keeps items to the configured primary targets, in nav order', () => {
    ROLES.forEach((role) => {
      const items = mobileItemsForRole(role)
      expect(items.length).toBeLessThanOrEqual(4)
      items.forEach((item) => {
        expect(MOBILE_PRIMARY[role]).toContain(item.to)
      })
    })
  })

  it('always includes the role dashboard', () => {
    ROLES.forEach((role) => {
      expect(mobileItemsForRole(role).map((i) => i.to)).toContain(
        `/${role}/dashboard`
      )
    })
  })

  it('drops disabled items even if their path were listed', () => {
    expect(mobileItemsForRole('student').every((i) => i.enabled !== false)).toBe(
      true
    )
  })
})

describe('titleForPath', () => {
  it('matches the longest specific route', () => {
    expect(titleForPath('/admin/users', 'admin')).toBe('Users')
    expect(titleForPath('/teacher/classes', 'teacher')).toBe('My Classes')
    expect(titleForPath('/student/requirements', 'student')).toBe(
      'My Requirements'
    )
  })

  it('titles a nested group route by its child page', () => {
    expect(titleForPath('/admin/students', 'admin')).toBe('Students')
    expect(titleForPath('/admin/teachers', 'admin')).toBe('Teachers')
    expect(titleForPath('/admin/parents', 'admin')).toBe('Parents')
  })

  it('matches a route prefix so nested paths still title correctly', () => {
    expect(titleForPath('/admin/users/42/edit', 'admin')).toBe('Users')
  })

  it('handles the shared top-level routes', () => {
    expect(titleForPath('/announcements', 'teacher')).toBe('Announcements')
    expect(titleForPath('/notifications', 'parent')).toBe('Notifications')
    expect(titleForPath('/profile', 'student')).toBe('Profile')
    expect(titleForPath('/login', 'student')).toBe('Sign in')
    expect(titleForPath('/dashboard', 'admin')).toBe('Dashboard')
  })

  it('falls back to a sensible label rather than blank', () => {
    // Unmatched path under a role route → Dashboard
    expect(titleForPath('/teacher/anything', 'teacher')).toBe('Dashboard')
    // Completely unknown path → the app name, never blank
    expect(titleForPath('/nowhere', 'teacher')).toBe('TRACK')
    expect(titleForPath('/nowhere', 'unknown')).toBe('TRACK')
  })
})
