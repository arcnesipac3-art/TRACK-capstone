import { useCallback, useMemo, useState } from 'react'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import api from '../services/api'
import { useConfirm } from '../context/ConfirmContext'
import useFetch from '../hooks/useFetch'
import ConflictPanel from '../components/schedules/ConflictPanel'
import ScheduleDetailModal from '../components/schedules/ScheduleDetailModal'
import ScheduleFilters from '../components/schedules/ScheduleFilters'
import ScheduleFormModal from '../components/schedules/ScheduleFormModal'
import ScheduleList from '../components/schedules/ScheduleList'
import ScheduleSummary from '../components/schedules/ScheduleSummary'
import TimetableGrid, { TimetableSkeleton } from '../components/schedules/TimetableGrid'
import UndoToast from '../components/schedules/UndoToast'
import {
  applyFilters,
  describeSchedule,
  detectConflicts,
  filterOptions,
  groupByAssignment,
  reasonsBySchedule,
  scheduleSummary,
  todayWeekday,
  weekRangeLabel,
} from '../utils/schedules'
import './SchedulesPage.css'

const NO_FILTERS = { teacher: '', section: '', subject: '', day: '' }
const UNDO_WINDOW_MS = 5000

/**
 * The weekly timetable, admin side.
 *
 * One request holds the whole week: conflict detection compares every pair of
 * periods, so it needs them all at once and the filters and both views are
 * derivations of the same rows rather than new round trips.
 */
export default function SchedulesPage() {
  const confirm = useConfirm()

  const [nonce, setNonce] = useState(0)
  const [view, setView] = useState('timetable')
  const [formOpen, setFormOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(null)
  const [selectedSchedule, setSelectedSchedule] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [conflictPanelOpen, setConflictPanelOpen] = useState(false)
  const [filters, setFilters] = useState(NO_FILTERS)
  const [undo, setUndo] = useState(null)

  const schedules = useFetch('/schedules/', { list: true, deps: [nonce] })
  const all = useMemo(() => schedules.data || [], [schedules.data])

  // "Today" is a clock question, but the timetable is a weekly pattern — it is
  // read once per mount, not on every keystroke in a filter.
  const today = useMemo(() => todayWeekday(), [])
  const weekLabel = useMemo(() => weekRangeLabel(), [])

  const allConflicts = useMemo(() => detectConflicts(all), [all])
  const reasons = useMemo(() => reasonsBySchedule(allConflicts), [allConflicts])
  const options = useMemo(() => filterOptions(all), [all])
  const stats = useMemo(() => scheduleSummary(all, today), [all, today])
  const rooms = useMemo(
    () =>
      Array.from(
        new Set(all.map((s) => (s.room || '').trim()).filter((room) => room.length > 0))
      ).sort((a, b) => a.localeCompare(b)),
    [all]
  )

  const filtered = useMemo(() => applyFilters(all, filters), [all, filters])
  const groups = useMemo(() => groupByAssignment(filtered), [filtered])
  const failed = Boolean(schedules.error)
  // Rows already on screen stay on screen while a save re-reads them: a
  // refresh should not blank the week the admin is looking at.
  const loaded = !failed && schedules.data !== null

  function refresh() {
    setNonce((n) => n + 1)
  }

  const closeUndo = useCallback(() => {
    setUndo((current) => {
      if (current?.timeoutId) clearTimeout(current.timeoutId)
      return null
    })
  }, [])

  function openForm(schedule = null) {
    setSelectedSchedule(null)
    setEditingSchedule(schedule)
    setFormOpen(schedule === null)
  }

  // `openForm(null)` *opens* the add dialog, so it can never be the way out of
  // it — dismissing needs to clear both halves of the dialog's identity.
  function closeForm() {
    setFormOpen(false)
    setEditingSchedule(null)
  }

  const shownStats = schedules.data && !failed ? stats : null
  // Only the first read has nothing to show; a refresh keeps the screen usable.
  const starting = schedules.loading && schedules.data === null

  async function requestDelete(schedule) {
    const accepted = await confirm({
      title: 'Delete Schedule?',
      message: `Remove ${describeSchedule(schedule)} from the weekly timetable?`,
      detail:
        'Past attendance sessions are preserved, but new sessions will no longer be generated for this time slot.',
      confirmLabel: 'Delete Schedule',
    })
    if (!accepted) return

    setDeleting(true)
    setDeleteError(null)

    try {
      await api.delete(`/schedules/${schedule.id}/`)
      setSelectedSchedule(null)

      // The row stays on screen for the length of the undo window, so what the
      // admin sees matches what the server still has until the list is re-read.
      const timeoutId = setTimeout(() => {
        refresh()
        setUndo(null)
      }, UNDO_WINDOW_MS)
      setUndo({ schedule, timeoutId })
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  async function handleUndo() {
    const schedule = undo?.schedule
    closeUndo()
    if (!schedule) return

    setDeleting(true)
    try {
      await api.post('/schedules/', {
        teacher_assignment: schedule.teacher_assignment,
        day_of_week: schedule.day_of_week,
        start_time: schedule.start_time,
        end_time: schedule.end_time,
        room: schedule.room || '',
      })
      refresh()
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Class Schedules"
        subtitle="Manage weekly class schedules and prevent timetable conflicts"
        actions={
          <Button variant="primary" size="sm" onClick={() => openForm()} disabled={starting}>
            <Icon name="plus" size={15} />
            Add Schedule
          </Button>
        }
      />

      <div className="stack stack-md">
        <ScheduleSummary
          stats={shownStats}
          loading={schedules.loading}
          failed={failed}
          today={today}
          onToggleConflicts={() => setConflictPanelOpen((open) => !open)}
        />

        {conflictPanelOpen && allConflicts.length > 0 && (
          <ConflictPanel
            conflicts={allConflicts}
            onScheduleClick={setSelectedSchedule}
            onClose={() => setConflictPanelOpen(false)}
          />
        )}

        <div className="sched-toolbar">
          <div className="sched-toolbar-left">
            <span className="sched-week-label">
              <Icon name="calendar" size={16} aria-hidden="true" />
              This week
              <span className="subtle">· {weekLabel}</span>
            </span>
            <StatusBadge
              tone="neutral"
              label="Recurring"
              title="The timetable shows recurring weekly classes, not one-off events"
            />
            {deleting && (
              <span className="sched-busy" role="status">
                Deleting…
              </span>
            )}
          </div>

          <div className="sched-toolbar-right" role="group" aria-label="Timetable view">
            <div className="sched-view-toggle">
              <Button
                size="sm"
                variant={view === 'timetable' ? 'primary' : 'secondary'}
                onClick={() => setView('timetable')}
                aria-pressed={view === 'timetable'}
              >
                <Icon name="grid" size={14} />
                Timetable
              </Button>
              <Button
                size="sm"
                variant={view === 'list' ? 'primary' : 'secondary'}
                onClick={() => setView('list')}
                aria-pressed={view === 'list'}
              >
                <Icon name="list" size={14} />
                List
              </Button>
            </div>
          </div>
        </div>

        <ScheduleFilters
          options={options}
          values={filters}
          onChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
          onClear={() => setFilters(NO_FILTERS)}
          disabled={starting || failed}
        />

        <section className="sched-timetable-card">
          {starting && <TimetableSkeleton today={today} />}

          {failed && (
            <div className="sched-panel-message">
              <ErrorMessage
                error={schedules.error}
                title="Could not load schedules"
                onRetry={schedules.reload}
              />
            </div>
          )}

          {loaded && all.length === 0 && (
            <div className="sched-panel-empty">
              <EmptyState
                icon="calendar"
                title="No schedules configured"
                message="Add your first class schedule to start building the weekly timetable."
                action={
                  <Button variant="primary" size="sm" onClick={() => openForm()}>
                    <Icon name="plus" size={15} />
                    Add Schedule
                  </Button>
                }
              />
            </div>
          )}

          {loaded && all.length > 0 && filtered.length === 0 && (
            <div className="sched-panel-empty">
              <EmptyState
                icon="search"
                title="No matching schedules"
                message="No schedules match your current filters. Try adjusting or clearing them."
              />
            </div>
          )}

          {loaded && filtered.length > 0 && view === 'timetable' && (
            <TimetableGrid
              schedules={filtered}
              conflicts={allConflicts}
              reasons={reasons}
              today={today}
              onScheduleClick={setSelectedSchedule}
              onEdit={openForm}
              onDelete={requestDelete}
            />
          )}

          {loaded && filtered.length > 0 && view === 'list' && (
            <ScheduleList groups={groups} reasons={reasons} onEdit={openForm} onDelete={requestDelete} />
          )}
        </section>

        {deleteError && (
          <div className="sched-delete-error" role="alert">
            <Icon name="info" size={15} aria-hidden="true" />
            <span>{deleteError}</span>
            <Button variant="ghost" size="xs" onClick={() => setDeleteError(null)} aria-label="Dismiss delete error">
              <Icon name="close" size={14} />
            </Button>
          </div>
        )}
      </div>

      {(formOpen || editingSchedule) && (
        <ScheduleFormModal
          schedule={editingSchedule}
          existingSchedules={all}
          rooms={rooms}
          onClose={closeForm}
          onSaved={() => {
            closeForm()
            refresh()
          }}
        />
      )}

      {selectedSchedule && (
        <ScheduleDetailModal
          schedule={selectedSchedule}
          onClose={() => setSelectedSchedule(null)}
          onEdit={openForm}
          onDelete={requestDelete}
        />
      )}

      {undo?.schedule && (
        <UndoToast
          schedule={undo.schedule}
          onUndo={handleUndo}
          onDismiss={() => {
            closeUndo()
            refresh()
          }}
        />
      )}
    </>
  )
}
