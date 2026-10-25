/**
 * Role-aware navigation for TRACK.
 *
 * `enabled: false` marks features that exist in the plan but have no screen
 * yet — they render as visibly disabled items instead of fake links.
 */

export const NAVIGATION = {
  // Admin items carry `perm`: the permission key the page needs. Django
  // enforces the same key on the endpoint behind each page — this only
  // decides what the sidebar offers. Items without `perm` (Dashboard,
  // Notifications) stay visible to every administrator; the dashboard itself
  // renders only the modules the administrator holds.
  admin: [
    { label: 'Dashboard', to: '/admin/dashboard', icon: 'grid' },
    // Users is a collapsible group: the item keeps its own route (/admin/users,
    // the "all users" directory) and nests the three role directories beneath
    // it. The sidebar renders `children` as an animated submenu; routes,
    // permissions and page components are unchanged.
    {
      label: 'Users',
      to: '/admin/users',
      icon: 'users',
      perm: 'users.view',
      // The directory pages all read /api/users/, so they need users.view;
      // *editing* students additionally needs students.manage (UserFormModal).
      children: [
        { label: 'Students', to: '/admin/students', icon: 'gradCap', perm: 'users.view' },
        { label: 'Teachers', to: '/admin/teachers', icon: 'user', perm: 'users.view' },
        { label: 'Parents', to: '/admin/parents', icon: 'users', perm: 'users.view' },
      ],
    },
    { label: 'School Structure', to: '/admin/sections', icon: 'layers', perm: 'structure.manage' },
    { label: 'Class Assignments', to: '/admin/assignments', icon: 'book', perm: 'structure.manage' },
    { label: 'Class Schedules', to: '/admin/schedules', icon: 'clock', perm: 'structure.manage' },
    { label: 'Fees', to: '/admin/fees', icon: 'creditCard', perm: 'fees.view' },
    { label: 'Requirements', to: '/admin/requirements', icon: 'clipboard', perm: 'requirements.view' },
    { label: 'Attendance', to: '/admin/attendance', icon: 'calendar', perm: 'attendance.view' },
    { label: 'Announcements', to: '/announcements', icon: 'megaphone', perm: 'announcements.view' },
    { label: 'Reports', to: '/admin/reports', icon: 'file', perm: 'reports.view' },
    { label: 'Departments & Roles', to: '/admin/departments', icon: 'shield', perm: 'departments.view' },
    { label: 'Audit Logs', to: '/admin/audit-logs', icon: 'clock', perm: 'audit.view' },
    { label: 'Notifications', to: '/notifications', icon: 'bell' },
    { label: 'System Settings', to: '/admin/settings', icon: 'settings', perm: 'settings.manage' },
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

/**
 * Sidebar items for a signed-in user.
 *
 * Administrators see only the pages their permission keys unlock (see
 * core/rbac.py). Other roles are unchanged: their nav is already scoped by
 * role and the backend keeps scoping their records.
 */
export function navForUser(user) {
  const items = navForRole(user?.role)
  if (user?.role !== 'admin') return items
  const allowed = (item) => !item.perm || user.permissions?.includes(item.perm)
  // Groups (e.g. Users) gate their children on the same permission model.
  return items
    .filter(allowed)
    .map((item) =>
      item.children ? { ...item, children: item.children.filter(allowed) } : item
    )
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
      // Collapsible groups (Users) title by the matching child page.
      for (const child of item.children || []) {
        if (child.to && pathname.startsWith(child.to)) return child.label
      }
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
