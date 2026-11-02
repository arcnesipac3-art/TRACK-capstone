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
    // Users is a collapsible group over the three role directories. Groups are
    // containers — they carry `children` and no `to` of their own, because
    // TRACK has no "all users" page an administrator would want to land on:
    // Students, Teachers and Parents are the real destinations. The label
    // still names the section in the breadcrumb, and the group stays
    // highlighted while a child is open.
    {
      label: 'Users',
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
    // The Registrar workspace, like Users a container over real pages rather
    // than a page itself. Django enforces enrollment.view / enrollment.manage
    // / enrollment.confirm on each endpoint behind these children.
    {
      label: 'Enrollment',
      container: true,
      icon: 'gradCap',
      perm: 'enrollment.view',
      children: [
        { label: 'Overview', to: '/admin/enrollment/overview', icon: 'grid', perm: 'enrollment.view' },
        { label: 'Applications', to: '/admin/enrollment/applications', icon: 'file', perm: 'enrollment.view' },
        { label: 'Enrollments', to: '/admin/enrollment/enrollments', icon: 'users', perm: 'enrollment.view' },
        { label: 'Enrollment Periods', to: '/admin/enrollment/periods', icon: 'calendar', perm: 'enrollment.view' },
        { label: 'Document Requirements', to: '/admin/enrollment/requirements', icon: 'clipboard', perm: 'enrollment.view' },
        { label: 'Enrollment Reports', to: '/admin/enrollment/reports', icon: 'file', perm: 'enrollment.view' },
      ],
    },
    { label: 'Fees', to: '/admin/fees', icon: 'creditCard', perm: 'fees.view' },
    { label: 'Requirements', to: '/admin/requirements', icon: 'clipboard', perm: 'requirements.view' },
    { label: 'Attendance', to: '/admin/attendance', icon: 'calendar', perm: 'attendance.view' },
    { label: 'Announcements', to: '/announcements', icon: 'megaphone', perm: 'announcements.view' },
    { label: 'Messages', to: '/messages', icon: 'chat' },
    { label: 'Reports', to: '/admin/reports', icon: 'file', perm: 'reports.view' },
    { label: 'Departments & Roles', to: '/admin/departments', icon: 'shield', perm: 'departments.view' },
    { label: 'Audit Logs', to: '/admin/audit-logs', icon: 'clock', perm: 'audit.view' },
    { label: 'Notifications', to: '/notifications', icon: 'bell' },
    { label: 'System Settings', to: '/admin/settings', icon: 'settings', perm: 'settings.manage' },
  ],
  teacher: [
    { label: 'Dashboard', to: '/teacher/dashboard', icon: 'grid' },
    // My Classes is the workspace: requirements, review and attendance live
    // inside each class (`/teacher/classes/<assignment>/…`) rather than as
    // separate sidebar modules, because a teacher plans around a class and its
    // students, not around a system module. The three standalone screens stay
    // routed for bookmarks and for the other roles that share them.
    { label: 'My Classes', to: '/teacher/classes', icon: 'book' },
    { label: 'Announcements', to: '/announcements', icon: 'megaphone' },
    { label: 'Messages', to: '/messages', icon: 'chat' },
    { label: 'Notifications', to: '/notifications', icon: 'bell' },
    { label: 'Profile', to: '/profile', icon: 'user' },
  ],
  student: [
    { label: 'Dashboard', to: '/student/dashboard', icon: 'grid' },
    { label: 'Enrollment', to: '/student/enrollment', icon: 'gradCap' },
    { label: 'My Requirements', to: '/student/requirements', icon: 'clipboard' },
    { label: 'My Submissions', to: '/student/submissions', icon: 'file' },
    { label: 'My Attendance', to: '/student/attendance', icon: 'calendar' },
    { label: 'My Fees', to: '/student/fees', icon: 'creditCard' },
    { label: 'Schedule', icon: 'clock', enabled: false },
    { label: 'Announcements', to: '/announcements', icon: 'megaphone' },
    { label: 'Messages', to: '/messages', icon: 'chat' },
    { label: 'Notifications', to: '/notifications', icon: 'bell' },
    { label: 'Profile', to: '/profile', icon: 'user' },
  ],
  parent: [
    { label: 'Dashboard', to: '/parent/dashboard', icon: 'grid' },
    { label: 'Enrollment', to: '/parent/enrollment', icon: 'gradCap' },
    { label: 'My Children', to: '/parent/children', icon: 'users' },
    { label: 'Requirements', to: '/parent/requirements', icon: 'clipboard' },
    { label: 'Attendance', to: '/parent/attendance', icon: 'calendar' },
    { label: 'Fees', to: '/parent/fees', icon: 'creditCard' },
    { label: 'Announcements', to: '/announcements', icon: 'megaphone' },
    { label: 'Messages', to: '/messages', icon: 'chat' },
    { label: 'Notifications', to: '/notifications', icon: 'bell' },
    { label: 'Profile', to: '/profile', icon: 'user' },
  ],
}

/** Navigation items used in the mobile bottom bar (max 4). */
export const MOBILE_PRIMARY = {
  admin: ['/admin/dashboard', '/admin/students', '/messages', '/notifications'],
  teacher: ['/teacher/dashboard', '/teacher/classes', '/messages', '/notifications'],
  student: ['/student/dashboard', '/student/requirements', '/messages', '/notifications'],
  parent: ['/parent/dashboard', '/parent/requirements', '/messages', '/notifications'],
}

/** Navigation items for a role. */
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

/**
 * The bottom bar's items, in the order listed above.
 *
 * Matched against groups *and* their children, so a role directory nested
 * under a container group (Students under Users) can be a primary stop.
 */
export function mobileItemsForRole(role) {
  const targets = MOBILE_PRIMARY[role] || []
  const flat = navForRole(role).flatMap((item) =>
    item.children ? [item, ...item.children] : [item]
  )
  return targets.map((to) => flat.find((item) => item.to === to)).filter(Boolean)
}

/**
 * Breadcrumb trail for a pathname: Dashboard → group → page.
 *
 * A group's children are tested before the group's own route, so the deepest
 * matching entry wins. Deeper routes inherit the trail of the navigation entry
 * they sit under, which is how `/admin/enrollment/applications/123` reads
 * Enrollment → Applications rather than stopping at an unnamed prefix.
 *
 * The last entry is the current page; earlier ones are links, except a group,
 * which only names its section and has no page to go to. A path outside the
 * role's navigation yields just the dashboard (or an empty trail), which keeps
 * the breadcrumb honest instead of inventing a page name.
 */
export function trailForPath(pathname, role) {
  const items = navForRole(role)
  const home = items.find((item) => item.to === `/${role}/dashboard`)
  const trail = home ? [{ label: home.label, to: home.to }] : []

  for (const item of items) {
    // The dashboard is already the root of the trail; matching it again would
    // put "Dashboard" in the breadcrumb twice.
    if (item === home) continue
    const child = (item.children || []).find((c) => c.to && pathname.startsWith(c.to))
    if (child) {
      // A group names the section; it has no page of its own to link to.
      trail.push({ label: item.label })
      trail.push({ label: child.label, to: child.to })
      return trail
    }
    if (item.to && pathname.startsWith(item.to)) {
      trail.push({ label: item.label, to: item.to })
      return trail
    }
  }
  return trail
}

/**
 * Screens every role can reach from the avatar menu, even where the sidebar
 * does not list them (administrators have no Profile item). Kept separate so
 * the topbar can still name the page without inventing a sidebar entry.
 *
 * The three teacher paths are the modules that moved inside a class
 * workspace. Their standalone routes stay live — bookmarks and other roles
 * still resolve them — so the topbar has to name them without a sidebar item
 * to inherit a label from.
 */
const SHARED_TITLES = {
  '/announcements': 'Announcements',
  '/messages': 'Messages',
  '/notifications': 'Notifications',
  '/profile': 'Profile',
  '/teacher/requirements': 'Requirements',
  '/teacher/review': 'Submission Review',
  '/teacher/attendance': 'Attendance',
}

/**
 * Activities inside one class workspace (`/teacher/classes/<assignment>/<slug>`).
 * They are not sidebar items — the class is the unit of navigation — but the
 * topbar still has to say which activity is open.
 */
export const CLASS_ACTIVITIES = {
  overview: 'Class overview',
  students: 'Students',
  requirements: 'Requirements',
  submissions: 'Submission review',
  attendance: 'Attendance',
  grades: 'Grades',
}

/**
 * One class workspace: `/teacher/classes/<assignment>` and its activities
 * (`/teacher/classes/<assignment>/attendance`). The bare id is the overview.
 */
const CLASS_ACTIVITY = /^\/teacher\/classes\/(\d+)(?:\/([a-z]+))?$/

/** Topbar title for a pathname, falling back per role. */
export function titleForPath(pathname, role) {
  const activity = CLASS_ACTIVITY.exec(pathname)
  if (activity) {
    return CLASS_ACTIVITIES[activity[2]] || CLASS_ACTIVITIES.overview
  }
  const trail = trailForPath(pathname, role)
  if (trail.length > 1) return trail[trail.length - 1].label
  if (SHARED_TITLES[pathname]) return SHARED_TITLES[pathname]
  if (pathname === '/login') return 'Sign in'
  if (pathname === '/dashboard' || pathname.startsWith(`/${role}`)) return 'Dashboard'
  return 'TRACK'
}
