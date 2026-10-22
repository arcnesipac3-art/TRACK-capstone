import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import './App.css'

import ProtectedRoute from './components/ProtectedRoute'
import RoleBasedRedirect from './components/RoleBasedRedirect'
import AppLayout from './components/layout/AppLayout'

import AnnouncementsPage from './pages/AnnouncementsPage'
import AttendancePage from './pages/AttendancePage'
import AssignmentsPage from './pages/AssignmentsPage'
import AuditLogsPage from './pages/AuditLogsPage'
import DepartmentsPage from './pages/DepartmentsPage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import NotificationsPage from './pages/NotificationsPage'
import ParentChildrenPage from './pages/ParentChildrenPage'
import ProfilePage from './pages/ProfilePage'
import ReportsPage from './pages/ReportsPage'
import RequirementsPage from './pages/RequirementsPage'
import SchedulesPage from './pages/SchedulesPage'
import SectionsPage from './pages/SectionsPage'
import SubmissionsPage from './pages/SubmissionsPage'
import SystemSettingsPage from './pages/SystemSettingsPage'
import TeacherClassesPage from './pages/TeacherClassesPage'
import UnauthorizedPage from './pages/UnauthorizedPage'
import UsersPage from './pages/UsersPage'

import AdminDashboard from './pages/dashboards/AdminDashboard'
import ParentDashboard from './pages/dashboards/ParentDashboard'
import StudentDashboard from './pages/dashboards/StudentDashboard'
import TeacherDashboard from './pages/dashboards/TeacherDashboard'

import AdminFeesPage from './pages/AdminFeesPage'
import AdminFeeCategoryDetailPage from './pages/AdminFeeCategoryDetailPage'
import AdminFeeAssessmentDetailPage from './pages/AdminFeeAssessmentDetailPage'
import StudentFeesPage from './pages/StudentFeesPage'
import ParentFeesPage from './pages/ParentFeesPage'

export default function App() {
  const { hash, pathname } = useLocation()

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

  return (
    <Routes>
      {/* ── Public ─────────────────────────────────────────────────── */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
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
            <Route path="/student/requirements" element={<RequirementsPage scope="student" />} />
            <Route path="/student/submissions" element={<SubmissionsPage mode="mine" />} />
            <Route path="/student/attendance" element={<AttendancePage mode="student" />} />
            <Route path="/student/fees" element={<StudentFeesPage />} />
          </Route>

          {/* Parent */}
          <Route element={<ProtectedRoute roles={['parent']} />}>
            <Route path="/parent/dashboard" element={<ParentDashboard />} />
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
