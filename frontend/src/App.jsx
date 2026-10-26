import { lazy, useEffect, useLayoutEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import './App.css'

import ProtectedRoute from './components/ProtectedRoute'
import RoleBasedRedirect from './components/RoleBasedRedirect'
import AppLayout from './components/layout/AppLayout'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import AboutPage from './pages/AboutPage'
import TermsPage from './pages/TermsPage'
import PrivacyPage from './pages/PrivacyPage'
import LocationPage from './pages/LocationPage'
import NotFoundPage from './pages/NotFoundPage'
import ResearchersPage from './pages/ResearchersPage'
import UnauthorizedPage from './pages/UnauthorizedPage'

// Public screens stay eager (first paint, no round-trip). Everything behind
// the authenticated shell is code-split per page: the old single chunk bundled
// all ~25 screens into one 600 kB file that every login had to download first.
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage'))
const AttendancePage = lazy(() => import('./pages/AttendancePage'))
const AssignmentsPage = lazy(() => import('./pages/AssignmentsPage'))
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage'))
const DepartmentsPage = lazy(() => import('./pages/DepartmentsPage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const ParentChildrenPage = lazy(() => import('./pages/ParentChildrenPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const RequirementsPage = lazy(() => import('./pages/RequirementsPage'))
const SchedulesPage = lazy(() => import('./pages/SchedulesPage'))
const SectionsPage = lazy(() => import('./pages/SectionsPage'))
const SubmissionsPage = lazy(() => import('./pages/SubmissionsPage'))
const SystemSettingsPage = lazy(() => import('./pages/SystemSettingsPage'))
const TeacherClassesPage = lazy(() => import('./pages/TeacherClassesPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))

const AdminDashboard = lazy(() => import('./pages/dashboards/AdminDashboard'))
const ParentDashboard = lazy(() => import('./pages/dashboards/ParentDashboard'))
const StudentDashboard = lazy(() => import('./pages/dashboards/StudentDashboard'))
const TeacherDashboard = lazy(() => import('./pages/dashboards/TeacherDashboard'))

const AdminFeesPage = lazy(() => import('./pages/AdminFeesPage'))
const AdminFeeCategoryDetailPage = lazy(() => import('./pages/AdminFeeCategoryDetailPage'))
const AdminFeeAssessmentDetailPage = lazy(() => import('./pages/AdminFeeAssessmentDetailPage'))
const StudentFeesPage = lazy(() => import('./pages/StudentFeesPage'))
const ParentFeesPage = lazy(() => import('./pages/ParentFeesPage'))

// Enrollment & Admissions — one applicant portal shared by students and
// their linked parents/guardians, one Registrar workspace for staff holding
// the enrollment.* permission keys (Django enforces them server-side).
const EnrollmentPortal = lazy(() => import('./pages/enrollment/EnrollmentPortal'))
const EnrollmentLandingPage = lazy(() => import('./pages/enrollment/EnrollmentLandingPage'))
const ApplicationWizardPage = lazy(() => import('./pages/enrollment/ApplicationWizardPage'))
const MyApplicationsPage = lazy(() => import('./pages/enrollment/MyApplicationsPage'))
const ApplicationDetailPage = lazy(() => import('./pages/enrollment/ApplicationDetailPage'))
const MyEnrollmentsPage = lazy(() => import('./pages/enrollment/MyEnrollmentsPage'))
const RegistrarDashboard = lazy(() => import('./pages/enrollment/RegistrarDashboard'))
const RegistrarApplicationsPage = lazy(() => import('./pages/enrollment/RegistrarApplicationsPage'))
const RegistrarApplicationReviewPage = lazy(() => import('./pages/enrollment/RegistrarApplicationReviewPage'))
const RegistrarEnrollmentsPage = lazy(() => import('./pages/enrollment/RegistrarEnrollmentsPage'))
const EnrollmentPeriodsPage = lazy(() => import('./pages/enrollment/EnrollmentPeriodsPage'))
const EnrollmentRequirementsPage = lazy(() => import('./pages/enrollment/EnrollmentRequirementsPage'))
const RegistrarReportsPage = lazy(() => import('./pages/enrollment/RegistrarReportsPage'))

export default function App() {
  const { hash, pathname } = useLocation()

  // index.html paints a branded splash screen before this bundle runs, so the
  // first frame is never a blank page. React's first commit happens before the
  // browser paints, and this layout effect runs during that commit — so the
  // splash is swapped for the real screen with no white flash in between.
  useLayoutEffect(() => {
    document.getElementById('app-splash')?.remove()
  }, [])

  // React Router ignores the URL fragment, and on a cold load the browser's own
  // fragment scroll fires before React has rendered the target — so opening
  // /#features directly used to land silently at the top of the page. Re-run it
  // once the route has committed, and again whenever the fragment changes.
  // Deliberately instant, matching the browser's own in-page anchor jumps.
  useEffect(() => {
    if (!hash) return
    const target = document.getElementById(decodeURIComponent(hash.slice(1)))
    if (target) target.scrollIntoView()
  }, [hash, pathname])

  // React Router swaps the two public pages by unmounting one and mounting the
  // other, so the arriving page used to land on the light `--bg` and flash
  // through its dark top half. Painting the body navy while a public route is
  // active gives the route fade (index.css) a dark backdrop to sit on. The
  // layout effect applies it before the new page's first paint, and it is
  // cleared on every other route so in-app navigation is untouched.
  const isPublicRoute =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/researchers' ||
    pathname === '/about' ||
    pathname === '/location' ||
    pathname === '/terms' ||
    pathname === '/privacy'
  useLayoutEffect(() => {
    document.body.classList.toggle('route-fade-stage', isPublicRoute)
  }, [isPublicRoute])

  return (
    <Routes>
      {/* ── Public ─────────────────────────────────────────────────── */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/researchers" element={<ResearchersPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/location" element={<LocationPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* ── Authenticated application shell ────────────────────────── */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          {/* Session restored → redirect to the right role dashboard */}
          <Route path="/dashboard" element={<RoleBasedRedirect />} />

          {/* Shared screens (any authenticated role) */}
          <Route path="/announcements" element={<AnnouncementsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/profile" element={<ProfilePage />} />

          {/* Administrator — each branch is gated on the permission key the
              page's endpoints require (Django enforces them again server-side) */}
          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route element={<ProtectedRoute permission="users.view" />}>
              <Route path="/admin/users" element={<UsersPage role="all" />} />
              <Route path="/admin/students" element={<UsersPage role="student" />} />
              <Route path="/admin/teachers" element={<UsersPage role="teacher" />} />
              <Route path="/admin/parents" element={<UsersPage role="parent" />} />
            </Route>
            <Route element={<ProtectedRoute permission="structure.manage" />}>
              <Route path="/admin/sections" element={<SectionsPage />} />
              <Route path="/admin/assignments" element={<AssignmentsPage />} />
              <Route path="/admin/schedules" element={<SchedulesPage />} />
            </Route>
            <Route element={<ProtectedRoute permission="enrollment.view" />}>
              <Route path="/admin/enrollment" element={<RegistrarDashboard />} />
              <Route path="/admin/enrollment/applications" element={<RegistrarApplicationsPage />} />
              <Route path="/admin/enrollment/applications/:id" element={<RegistrarApplicationReviewPage />} />
              <Route path="/admin/enrollment/enrollments" element={<RegistrarEnrollmentsPage />} />
              <Route path="/admin/enrollment/periods" element={<EnrollmentPeriodsPage />} />
              <Route path="/admin/enrollment/requirements" element={<EnrollmentRequirementsPage />} />
              <Route path="/admin/enrollment/reports" element={<RegistrarReportsPage />} />
            </Route>
            <Route path="/admin/requirements" element={<RequirementsPage scope="admin" />} />
            <Route path="/admin/attendance" element={<AttendancePage mode="admin" />} />
            <Route element={<ProtectedRoute permission="fees.view" />}>
              <Route path="/admin/fees" element={<AdminFeesPage />} />
              <Route path="/admin/fees/categories/new" element={<AdminFeeCategoryDetailPage />} />
              <Route path="/admin/fees/categories/:id" element={<AdminFeeCategoryDetailPage />} />
              <Route path="/admin/fees/assessments/new" element={<AdminFeeAssessmentDetailPage />} />
              <Route path="/admin/fees/assessments/:id" element={<AdminFeeAssessmentDetailPage />} />
            </Route>
            <Route element={<ProtectedRoute permission="reports.view" />}>
              <Route path="/admin/reports" element={<ReportsPage />} />
            </Route>
            <Route element={<ProtectedRoute permission="departments.view" />}>
              <Route path="/admin/departments" element={<DepartmentsPage />} />
            </Route>
            <Route element={<ProtectedRoute permission="audit.view" />}>
              <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
            </Route>
            <Route element={<ProtectedRoute permission="settings.manage" />}>
              <Route path="/admin/settings" element={<SystemSettingsPage />} />
            </Route>
          </Route>

          {/* Teacher */}
          <Route element={<ProtectedRoute roles={['teacher']} />}>
            <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
            <Route path="/teacher/classes" element={<TeacherClassesPage />} />
            <Route path="/teacher/requirements" element={<RequirementsPage scope="teacher" />} />
            <Route path="/teacher/review" element={<SubmissionsPage mode="review" />} />
            <Route path="/teacher/attendance" element={<AttendancePage mode="teacher" />} />
          </Route>

          {/* Student */}
          <Route element={<ProtectedRoute roles={['student']} />}>
            <Route path="/student/dashboard" element={<StudentDashboard />} />
            <Route path="/student/enrollment" element={<EnrollmentPortal />}>
              <Route index element={<EnrollmentLandingPage />} />
              <Route path="new" element={<ApplicationWizardPage />} />
              <Route path="applications" element={<MyApplicationsPage />} />
              <Route path="applications/:id" element={<ApplicationDetailPage />} />
              <Route path="history" element={<MyEnrollmentsPage />} />
            </Route>
            <Route path="/student/requirements" element={<RequirementsPage scope="student" />} />
            <Route path="/student/submissions" element={<SubmissionsPage mode="mine" />} />
            <Route path="/student/attendance" element={<AttendancePage mode="student" />} />
            <Route path="/student/fees" element={<StudentFeesPage />} />
          </Route>

          {/* Parent */}
          <Route element={<ProtectedRoute roles={['parent']} />}>
            <Route path="/parent/dashboard" element={<ParentDashboard />} />
            <Route path="/parent/enrollment" element={<EnrollmentPortal />}>
              <Route index element={<EnrollmentLandingPage />} />
              <Route path="new" element={<ApplicationWizardPage />} />
              <Route path="applications" element={<MyApplicationsPage />} />
              <Route path="applications/:id" element={<ApplicationDetailPage />} />
              <Route path="history" element={<MyEnrollmentsPage />} />
            </Route>
            <Route path="/parent/children" element={<ParentChildrenPage />} />
            <Route path="/parent/requirements" element={<RequirementsPage scope="parent" />} />
            <Route path="/parent/attendance" element={<AttendancePage mode="parent" />} />
            <Route path="/parent/fees" element={<ParentFeesPage />} />
          </Route>
        </Route>
      </Route>

      {/* ── Not found ──────────────────────────────────────────────── */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
