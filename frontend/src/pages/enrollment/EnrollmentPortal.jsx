import { Outlet } from 'react-router-dom'

/**
 * Layout route for the applicant enrollment portal.
 *
 * Mounted once per applicant role (/student/enrollment and
 * /parent/enrollment); every enrollment child route renders inside the
 * shared vertical stack.
 */
export default function EnrollmentPortal() {
  return (
    <div className="stack stack-md">
      <Outlet />
    </div>
  )
}
