/**
 * Role-aware navigation for TRACK.
 *
 * `enabled: false` marks features that exist in the plan but have no screen
 * yet — they render as visibly disabled items instead of fake links.
 */

export const NAVIGATION = {
  admin: [
    { label: 'Dashboard', to: '/admin/dashboard', icon: 'grid' },
    { label: 'Users', to: '/admin/users', icon: 'users' },
    { label: 'Students', to: '/admin/students', icon: 'user' },
    { label: 'Teachers', to: '/admin/teachers', icon: 'user' },
    { label: 'Parents', to: '/admin/parents', icon: 'users' },
    { label: 'School Structure', to: '/admin/sections', icon: 'layers' },
    { label: 'Class Assignments', to: '/admin/assignments', icon: 'book' },
    { label: 'Class Schedules', to: '/admin/schedules', icon: 'clock' },
    { label: 'Fees', to: '/admin/fees', icon: 'creditCard' },
    { label: 'Requirements', to: '/admin/requirements', icon: 'clipboard' },
    { label: 'Attendance', to: '/admin/attendance', icon: 'calendar' },
    { label: 'Announcements', to: '/announcements', icon: 'megaphone' },
    { label: 'Notifications', to: '/notifications', icon: 'bell' },
    { label: 'Settings', icon: 'settings', enabled: false },
  ],
  teacher: [
    { label: 'Dashboard', to: '/teacher/dashboard', icon: 'grid' },
    { label: 'My Classes', to: '/teacher/classes', icon: 'book' },
    { label: 'Requirements', to: '/teacher/requirements', icon: 'clipboard' },
    { label: 'Submission Review', to: '/teacher/review', icon: 'checkSquare' },
    { label: 'Attendance', to: '/teacher/attendance', icon: 'calendar' },
    { label: 'Announcements', to: '/announcements', icon: 'megaphone' },
    { label: 'Notifications', to: '/notifications', icon: 'bell' },
    { label: 'Profile', to: '/profile', icon: 'user' },
  ],
  student: [
    { label: 'Dashboard', to: '/student/dashboard', icon: 'grid' },
    { label: 'My Requirements', to: '/student/requirements', icon: 'clipboard' },
    { label: 'My Submissions', to: '/student/submissions', icon: 'file' },
    { label: 'My Attendance', to: '/student/attendance', icon: 'calendar' },
    { label: 'My Fees', to: '/student/fees', icon: 'creditCard' },
    { label: 'Schedule', icon: 'clock', enabled: false },
    { label: 'Announcements', to: '/announcements', icon: 'megaphone' },
    { label: 'Notifications', to: '/notifications', icon: 'bell' },
    { label: 'Profile', to: '/profile', icon: 'user' },
  ],
  parent: [
    { label: 'Dashboard', to: '/parent/dashboard', icon: 'grid' },
    { label: 'My Children', to: '/parent/children', icon: 'users' },
    { label: 'Requirements', to: '/parent/requirements', icon: 'clipboard' },
    { label: 'Attendance', to: '/parent/attendance', icon: 'calendar' },
    { label: 'Fees', to: '/parent/fees', icon: 'creditCard' },
    { label: 'Announcements', to: '/announcements', icon: 'megaphone' },
    { label: 'Notifications', to: '/notifications', icon: 'bell' },
    { label: 'Profile', to: '/profile', icon: 'user' },
  ],
}

/** Navigation items used in the mobile bottom bar (max 4). */
export const MOBILE_PRIMARY = {
  admin: ['/admin/dashboard', '/admin/users', '/notifications'],
  teacher: ['/teacher/dashboard', '/teacher/review', '/notifications'],
  student: ['/student/dashboard', '/student/requirements', '/notifications'],
  parent: ['/parent/dashboard', '/parent/requirements', '/notifications'],
}

export function navForRole(role) {
  return NAVIGATION[role] || []
}

export function mobileItemsForRole(role) {
  const targets = MOBILE_PRIMARY[role] || []
  const items = navForRole(role).filter((item) => targets.includes(item.to))
  return items
}

/** Topbar title for a pathname, falling back per role. */
export function titleForPath(pathname, role) {
  for (const items of Object.values(NAVIGATION)) {
    for (const item of items) {
      if (item.to && pathname.startsWith(item.to)) return item.label
    }
  }
  if (pathname === '/dashboard') return 'Dashboard'
  if (pathname === '/announcements') return 'Announcements'
  if (pathname === '/notifications') return 'Notifications'
  if (pathname === '/profile') return 'Profile'
  if (pathname === '/login') return 'Sign in'
  if (pathname.startsWith(`/${role}`)) return 'Dashboard'
  return 'TRACK'
}
