import { useState } from 'react'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import StatusBadge from '../../components/StatusBadge'
import AttendanceSummaryCard from '../../components/dashboard/AttendanceSummaryCard'
import Card from '../../components/dashboard/Card'
import CardSkeleton from '../../components/loading/CardSkeleton'
import StatCardSkeleton from '../../components/loading/StatCardSkeleton'
import NotificationsCard from '../../components/dashboard/NotificationsCard'
import RequirementsExplorer from '../../components/requirements/RequirementsExplorer'
import { useAuth } from '../../context/AuthContext'
import useFetch from '../../hooks/useFetch'
import {
  attendanceStatus,
  formatDate,
  formatRelative,
  TODAY_LABEL,
} from '../../utils/format'
import { attendanceSummary } from '../../utils/stats'

export default function ParentDashboard() {
  const { user } = useAuth()
  const summary = useFetch('/dashboard/')
  const [selectedId, setSelectedId] = useState(null)

  const children = summary.data?.children || []
  const activeChild =
    children.find((child) => child.student_id === selectedId) || children[0]

  const records = useFetch('/attendance/records/', {
    list: true,
    params: activeChild ? { student: activeChild.student_id } : null,
    enabled: Boolean(activeChild),
  })

  const announcements = useFetch('/announcements/', { list: true })

  const firstName = (user.fullName || '').split(' ')[0] || user.fullName

  if (summary.loading && !summary.data) {
    return (
      <>
        <span className="sr-only" role="status">
          Loading your dashboard…
        </span>
        <div className="dashboard" aria-hidden="true">
          <div className="grid grid-4">
            {[0, 1, 2, 3].map((i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
          <CardSkeleton />
        </div>
      </>
    )
  }

  if (summary.error) {
    return (
      <ErrorMessage
        error={summary.error}
        title="Could not load your dashboard"
        onRetry={summary.reload}
      />
    )
  }

  if (children.length === 0) {
    return (
      <div className="dashboard">
        <PageHeader title={`Welcome, ${firstName}`} />
        <Card title="Linked children">
          <EmptyState
            icon="users"
            title="No linked children yet"
            message="Your account is not connected to any student record. Please coordinate with the school registrar to link your child."
          />
        </Card>
        <NotificationsCard />
      </div>
    )
  }

  const recentRecords = (records.data || []).slice(0, 5)
  const childAttendance = attendanceSummary(records.data || [])

  return (
    <div className="dashboard">
      <PageHeader
        title={`Welcome, ${firstName}`}
        subtitle={`Track your ${children.length === 1 ? 'child' : 'children'}'s requirements and attendance · ${TODAY_LABEL}`}
      />

      {children.length > 1 && (
        <div
          className="child-selector"
          role="tablist"
          aria-label="Select child"
        >
          {children.map((child) => (
            <button
              key={child.student_id}
              type="button"
              role="tab"
              aria-selected={activeChild?.student_id === child.student_id}
              className={`child-chip${
                activeChild?.student_id === child.student_id ? ' active' : ''
              }`}
              onClick={() => setSelectedId(child.student_id)}
            >
              {child.name}
              {child.section && (
                <span className="chip-section">{child.section}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {children.length === 1 && (
        <p className="muted" style={{ marginTop: -8 }}>
          Showing records for <strong>{children[0].name}</strong>
          {children[0].section ? ` · ${children[0].section}` : ''}.
        </p>
      )}

      <div className="grid grid-4">
        <StatCard
          label="Requirements"
          value={activeChild?.total_requirements ?? '—'}
          hint={activeChild?.section || 'Assigned to this section'}
        />
        <StatCard
          label="Overdue"
          value={activeChild?.overdue ?? '—'}
          tone={activeChild?.overdue > 0 ? 'red' : 'default'}
          hint="Past deadline, not submitted"
        />
        <StatCard
          label="Awaiting check"
          value={activeChild?.awaiting_verification ?? '—'}
          tone="amber"
          hint="Waiting for the teacher"
        />
        <StatCard
          label="Verified"
          value={activeChild?.verified ?? '—'}
          tone="green"
          hint="Accepted by the teacher"
        />
      </div>

      <div className="two-col">
        <div className="stack stack-md">
          <section className="card">
            <header className="card-header">
              <h2>
                Requirements
                {activeChild ? ` · ${activeChild.name}` : ''}
              </h2>
            </header>
            <div className="card-body">
              <RequirementsExplorer
                scope="parent"
                params={activeChild ? { child: activeChild.student_id } : {}}
              />
            </div>
          </section>

          <Card
            title={`Recent attendance${activeChild ? ` · ${activeChild.name}` : ''}`}
            loading={records.loading}
            error={records.error}
            onRetry={records.reload}
            empty={
              !records.loading && recentRecords.length === 0 ? (
                <EmptyState
                  icon="calendar"
                  title="No attendance recorded yet"
                  message="Attendance records for this child will appear here."
                />
              ) : null
            }
            flush
          >
            <div className="table-wrap">
              <table className="table responsive-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Class</th>
                    <th>Subject</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRecords.map((record) => (
                    <tr key={record.id}>
                      <td data-label="Date">{formatDate(record.session_detail?.date)}</td>
                      <td data-label="Class" className="cell-main">
                        {record.session_detail?.section_name || '—'}
                      </td>
                      <td data-label="Subject">
                        {record.session_detail?.subject_name || '—'}
                      </td>
                      <td data-label="Status">
                        <StatusBadge
                          label={attendanceStatus(record.status).label}
                          tone={attendanceStatus(record.status).tone}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="stack stack-md">
          <AttendanceSummaryCard
            attendance={childAttendance}
            title={`Attendance${activeChild ? ` · ${activeChild.name}` : ''}`}
          />

          <Card
            title="Announcements"
            loading={announcements.loading}
            error={announcements.error}
            onRetry={announcements.reload}
            empty={
              !announcements.loading &&
              (announcements.data || []).length === 0 ? (
                <EmptyState
                  icon="megaphone"
                  title="No announcements"
                  message="School announcements for parents will be listed here."
                />
              ) : null
            }
          >
            <div className="stack stack-md">
              {(announcements.data || []).slice(0, 3).map((item) => (
                <div key={item.id}>
                  <div className="row row-wrap" style={{ gap: 8 }}>
                    <strong style={{ fontSize: '0.92rem' }}>{item.title}</strong>
                    {item.is_pinned && (
                      <span className="badge badge-blue">Pinned</span>
                    )}
                  </div>
                  <p className="muted" style={{ fontSize: '0.86rem', marginTop: 4 }}>
                    {item.body.length > 160
                      ? `${item.body.slice(0, 160)}…`
                      : item.body}
                  </p>
                  <p className="subtle" style={{ marginTop: 4 }}>
                    {formatRelative(item.published_at)}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <NotificationsCard />
        </div>
      </div>
    </div>
  )
}
