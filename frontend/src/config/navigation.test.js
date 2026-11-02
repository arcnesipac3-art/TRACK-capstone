import { describe, expect, it } from 'vitest'
import {
  MOBILE_PRIMARY,
  NAVIGATION,
  mobileItemsForRole,
  navForRole,
  navForUser,
  titleForPath,
  trailForPath,
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
        } else if (item.children) {
          // A group is a toggle over its children, never a page of its own.
          expect(item.to).toBeUndefined()
          expect(item.children.length).toBeGreaterThan(0)
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

describe('teacher navigation — My Classes is the workspace', () => {
  it('offers only the six entries a teacher navigates by', () => {
    expect(navForRole('teacher').map((item) => item.label)).toEqual([
      'Dashboard',
      'My Classes',
      'Announcements',
      'Messages',
      'Notifications',
      'Profile',
    ])
  })

  it('keeps the modules that moved inside a class off the sidebar but reachable', () => {
    const tos = navForRole('teacher').map((item) => item.to)
    expect(tos).not.toContain('/teacher/requirements')
    expect(tos).not.toContain('/teacher/review')
    expect(tos).not.toContain('/teacher/attendance')
    // The standalone routes still exist, so the topbar still names them.
    expect(titleForPath('/teacher/requirements', 'teacher')).toBe('Requirements')
    expect(titleForPath('/teacher/review', 'teacher')).toBe('Submission Review')
    expect(titleForPath('/teacher/attendance', 'teacher')).toBe('Attendance')
  })

  it('trails a class activity back through My Classes', () => {
    expect(trailForPath('/teacher/classes/500/attendance', 'teacher')).toEqual([
      { label: 'Dashboard', to: '/teacher/dashboard' },
      { label: 'My Classes', to: '/teacher/classes' },
    ])
  })
})

describe('navForUser', () => {
  const adminWith = (permissions) => ({ role: 'admin', permissions })

  it('shows an administrator only the pages their permissions unlock', () => {
    const items = navForUser(adminWith(['users.view']))
    expect(items.map((i) => i.to)).toContain('/admin/dashboard')
    // Users is offered, but only as the container over the three directories.
    expect(items.find((i) => i.label === 'Users')?.children).toHaveLength(3)
    expect(items.map((i) => i.to)).not.toContain('/admin/fees')
    expect(items.map((i) => i.to)).not.toContain('/admin/departments')
    expect(items.map((i) => i.to)).not.toContain('/admin/audit-logs')
  })

  it('keeps Dashboard, Messages and Notifications visible for every administrator', () => {
    // Messages is not permission-gated: who may open a thread is decided by
    // conversation membership in Django, not by an administrator permission key.
    expect(navForUser(adminWith([])).map((i) => i.to)).toEqual([
      '/admin/dashboard',
      '/messages',
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
    expect(titleForPath('/admin/enrollment/overview', 'admin')).toBe('Overview')
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
    expect(titleForPath('/admin/enrollment/applications/42', 'admin')).toBe(
      'Applications'
    )
  })

  it('falls back to Dashboard for a route that does not exist', () => {
    // /admin/users never existed and /admin/enrollment is only a group, so the
    // topbar will not invent a page name for either.
    expect(titleForPath('/admin/users', 'admin')).toBe('Dashboard')
    expect(titleForPath('/admin/enrollment', 'admin')).toBe('Dashboard')
  })

  it('handles the shared top-level routes', () => {
    expect(titleForPath('/announcements', 'teacher')).toBe('Announcements')
    expect(titleForPath('/notifications', 'parent')).toBe('Notifications')
    expect(titleForPath('/profile', 'student')).toBe('Profile')
    expect(titleForPath('/login', 'student')).toBe('Sign in')
    expect(titleForPath('/dashboard', 'admin')).toBe('Dashboard')
  })

  it('names an avatar-menu page the administrator’s sidebar does not list', () => {
    expect(NAVIGATION.admin.some((i) => i.to === '/profile')).toBe(false)
    expect(titleForPath('/profile', 'admin')).toBe('Profile')
    expect(titleForPath('/notifications', 'admin')).toBe('Notifications')
  })

  it('titles each activity of one class workspace', () => {
    expect(titleForPath('/teacher/classes/500', 'teacher')).toBe('Class overview')
    expect(titleForPath('/teacher/classes/500/students', 'teacher')).toBe('Students')
    expect(titleForPath('/teacher/classes/500/requirements', 'teacher')).toBe('Requirements')
    expect(titleForPath('/teacher/classes/500/submissions', 'teacher')).toBe('Submission review')
    expect(titleForPath('/teacher/classes/500/attendance', 'teacher')).toBe('Attendance')
    expect(titleForPath('/teacher/classes/500/grades', 'teacher')).toBe('Grades')
    // A slug with no screen still reads as the class instead of a blank title.
    expect(titleForPath('/teacher/classes/500/timetable', 'teacher')).toBe('Class overview')
    // A non-numeric id is not a class, so it falls back to the sidebar entry.
    expect(titleForPath('/teacher/classes/new/students', 'teacher')).toBe('My Classes')
  })

  it('falls back to a sensible label rather than blank', () => {
    // Unmatched path under a role route → Dashboard
    expect(titleForPath('/teacher/anything', 'teacher')).toBe('Dashboard')
    // Completely unknown path → the app name, never blank
    expect(titleForPath('/nowhere', 'teacher')).toBe('TRACK')
    expect(titleForPath('/nowhere', 'unknown')).toBe('TRACK')
  })
})

describe('trailForPath', () => {
  const home = (role) => ({ label: 'Dashboard', to: `/${role}/dashboard` })

  it('puts a group between the dashboard and its child page', () => {
    expect(trailForPath('/admin/students', 'admin')).toEqual([
      home('admin'),
      // Users is a container, so it names the section without a link.
      { label: 'Users' },
      { label: 'Students', to: '/admin/students' },
    ])
  })

  it('is dashboard → page for a top-level page', () => {
    expect(trailForPath('/teacher/classes', 'teacher')).toEqual([
      home('teacher'),
      { label: 'My Classes', to: '/teacher/classes' },
    ])
    expect(trailForPath('/profile', 'student')).toEqual([
      home('student'),
      { label: 'Profile', to: '/profile' },
    ])
  })

  it('gives the dashboard itself a single crumb, never Dashboard → Dashboard', () => {
    expect(trailForPath('/admin/dashboard', 'admin')).toEqual([home('admin')])
  })

  it('carries a deep route under the navigation entry it belongs to', () => {
    expect(trailForPath('/admin/enrollment/applications/123', 'admin')).toEqual([
      home('admin'),
      { label: 'Enrollment' },
      { label: 'Applications', to: '/admin/enrollment/applications' },
    ])
    expect(trailForPath('/admin/students/42/edit', 'admin')).toEqual([
      home('admin'),
      { label: 'Users' },
      { label: 'Students', to: '/admin/students' },
    ])
  })

  it('invents nothing for a path outside the role’s navigation', () => {
    expect(trailForPath('/nowhere', 'teacher')).toEqual([home('teacher')])
    expect(trailForPath('/nowhere', 'robot')).toEqual([])
    // /profile is reachable by every role but is not an administrator sidebar
    // item, so the trail stops at the dashboard rather than claiming otherwise.
    expect(trailForPath('/profile', 'admin')).toEqual([home('admin')])
  })
})
