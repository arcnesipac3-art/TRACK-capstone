import PageHeader from '../components/PageHeader'
import AdminAttendance from './attendance/AdminAttendance'
import ParentAttendance from './attendance/ParentAttendance'
import RecordsTable from './attendance/RecordsTable'
import TeacherAttendance from './attendance/TeacherAttendance'
import './attendance/AttendancePage.css'

const COPY = {
  student: {
    title: 'My Attendance',
    subtitle: 'Your recorded attendance across your classes.',
  },
  parent: {
    title: 'Attendance',
    subtitle: 'Attendance records for your selected child.',
  },
  teacher: {
    title: 'Attendance',
    subtitle: 'Pick a session, mark the roster in one pass, then save it.',
  },
  admin: {
    title: 'Attendance',
    subtitle: 'Attendance sessions recorded across the school.',
  },
}

/**
 * The attendance entry point for all four portals.
 *
 * The screen bodies live in `pages/attendance/`; this file only picks one and
 * puts the page header above it. `mode`, `assignmentId` and `embedded` are the
 * contract the class workspace relies on: a teacher who opens attendance from
 * a class card passes that assignment and asks for no header, because the card
 * already said which class they are standing in.
 */
export default function AttendancePage({ mode = 'student', assignmentId = null, embedded = false }) {
  const copy = COPY[mode] || COPY.student

  return (
    <div className={`att-page stack ${embedded ? 'stack-sm' : 'stack-md'}`}>
      {!embedded && <PageHeader title={copy.title} subtitle={copy.subtitle} />}

      {mode === 'student' && <RecordsTable />}
      {mode === 'parent' && <ParentAttendance />}
      {mode === 'teacher' && <TeacherAttendance assignmentId={assignmentId} />}
      {mode === 'admin' && <AdminAttendance />}
    </div>
  )
}
