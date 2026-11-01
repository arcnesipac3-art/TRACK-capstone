import AdminContextPanel from './AdminContextPanel'
import AttendanceContextPanel from './AttendanceContextPanel'
import EnrollmentContextPanel from './EnrollmentContextPanel'
import PeopleContextPanel from './PeopleContextPanel'
import VerificationContextPanel from './VerificationContextPanel'

/**
 * Route → contextual-panel registry for the shell's third column.
 *
 * Only routes with genuinely useful context are listed; everything else —
 * reports, settings, fees, schedules, the student/parent portals, public
 * pages — renders no panel at all, per the "never fill the sidebar with
 * irrelevant information" rule. Access needs no re-check here: the routes
 * below sit behind the same `ProtectedRoute` permission guards that already
 * had to pass for the page to render.
 */
const RULES = [
  { test: /^\/admin\/dashboard$/, title: 'Today at a glance', Panel: AdminContextPanel },
  { test: /^\/admin\/enrollment(\/|$)/, title: 'Enrollment context', Panel: EnrollmentContextPanel },
  { test: /^\/(admin|teacher)\/attendance$/, title: 'Attendance context', Panel: AttendanceContextPanel },
  { test: /^\/(admin|teacher)\/requirements$/, title: 'Verification context', Panel: VerificationContextPanel },
  { test: /^\/teacher\/review$/, title: 'Verification context', Panel: VerificationContextPanel },
  { test: /^\/admin\/(students|teachers|parents)$/, title: 'Directory context', Panel: PeopleContextPanel },
]

/** `{ title, element }` for the active route, or `null` to hide the column. */
export function contextPanelFor(pathname) {
  const rule = RULES.find((candidate) => candidate.test.test(pathname))
  if (!rule) return null
  return { title: rule.title, element: <rule.Panel key={rule.title} /> }
}
