import { useState } from 'react'
import Button from '../Button'
import Icon from '../Icon'
import PushPreferences from './PushPreferences'
import { formatDateTime, initials, roleLabel } from '../../utils/format'

/**
 * Right column: who is in this thread and how far each of them has read.
 *
 * `can_manage_members` and `can_post` come from the server's detail payload —
 * they are the server's answers to its own permission checks, not a client-side
 * guess about the role. The controls here only decide what is offered; the
 * endpoint refuses the same request regardless of what this column renders.
 */
export default function ThreadDetails({
  thread,
  presence,
  myUserId,
  contacts,
  busyKey = null,
  onClose,
  onAddMember,
  onRemoveMember,
  onSyncMembers,
  onArchive,
  onLeave,
}) {
  const [term, setTerm] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  // One request in flight at a time: every control goes inert while any of
  // them is busy, and only the one that started it spins.
  const busy = Boolean(busyKey)
  const members = thread?.members || []
  const structural = thread?.kind === 'class' || thread?.kind === 'department'
  const status = thread?.status || { delivered: 0, read: 0, total: 0, of_newest: null }

  const matches = (term.trim() ? contacts : [])
    .filter((row) => !members.some((member) => member.user_id === row.id))
    .slice(0, 8)

  return (
    <aside className="messaging-column thread-details" aria-label="Conversation details">
      <header className="details-head">
        <h2 className="column-title text-truncate">Details</h2>
        {onClose && (
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Hide details">
            <Icon name="close" size={18} />
          </button>
        )}
      </header>

      <div className="details-scroll">
        <section className="details-block">
          <h3 className="section-title">{thread?.display_name || 'Conversation'}</h3>
          <p className="muted">
            {thread?.kind_label} · started {formatDateTime(thread?.created_at)}
          </p>
          {thread?.is_archived && <p className="badge badge-amber">Archived</p>}
        </section>

        <section className="details-block">
          <h3 className="section-title">Latest message</h3>
          {status.of_newest === null ? (
            <p className="muted">No messages yet.</p>
          ) : (
            <ul className="receipt-list">
              <li>
                <span>Delivered</span>
                <strong>
                  {status.delivered} of {status.total}
                </strong>
              </li>
              <li>
                <span>Read</span>
                <strong>
                  {status.read} of {status.total}
                </strong>
              </li>
            </ul>
          )}
        </section>

        <section className="details-block">
          <div className="row row-between">
            <h3 className="section-title">Members ({members.length})</h3>
            {thread?.can_manage_members && (
              <Button size="xs" variant="ghost" onClick={() => setPickerOpen((open) => !open)}>
                <Icon name="userPlus" size={14} />
                <span className="btn-content">{pickerOpen ? 'Done' : 'Add'}</span>
              </Button>
            )}
          </div>

          {pickerOpen && (
            <div className="member-picker">
              <label className="field">
                <span className="visually-hidden">Find a person to add</span>
                <input
                  className="input input-sm"
                  type="search"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="Name or username"
                />
              </label>
              {matches.length === 0 ? (
                <p className="subtle">
                  {term.trim()
                    ? 'No reachable person by that name.'
                    : 'Everyone you may add is already here.'}
                </p>
              ) : (
                <ul>
                  {matches.map((row) => (
                    <li key={row.id} className="picker-row">
                      <span className="avatar" aria-hidden="true">
                        {initials(row.full_name)}
                      </span>
                      <span className="grow stack stack-xs">
                        <span className="text-truncate">{row.full_name}</span>
                        <span className="subtle">
                          {roleLabel(row.role)}
                          {row.detail ? ` · ${row.detail}` : ''}
                        </span>
                      </span>
                      <Button
                        size="xs"
                        onClick={() => onAddMember(row)}
                        disabled={busy}
                        loading={busyKey === `add-${row.id}`}
                      >
                        Add
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <ul className="member-list">
            {members.map((member) => {
              const online = presence.has(member.user_id) || member.online
              const isMe = member.user_id === myUserId
              return (
                <li key={member.user_id} className="member-row">
                  <span className="row-avatar">
                    <span className="avatar" aria-hidden="true">
                      {initials(member.full_name)}
                    </span>
                    {online && <span className="presence-dot" aria-hidden="true" />}
                  </span>
                  <span className="grow stack stack-xs">
                    <span className="text-truncate">
                      {member.full_name}
                      {isMe ? ' (you)' : ''}
                    </span>
                    <span className="subtle">
                      {roleLabel(member.user_role)}
                      {member.role !== 'member' ? ` · ${member.role_label}` : ''}
                      {member.last_read_seq != null && online ? ' · reading' : ''}
                    </span>
                  </span>
                  {!isMe && thread?.can_manage_members && (
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => onRemoveMember(member)}
                      disabled={busy}
                      aria-busy={busyKey === `remove-${member.user_id}` || undefined}
                      aria-label={`Remove ${member.full_name}`}
                    >
                      <Icon name="close" size={15} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        <section className="details-block actions">
          {structural && thread?.can_manage_members && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onSyncMembers}
              disabled={busy}
              loading={busyKey === 'sync'}
              loadingLabel="Syncing…"
            >
              <Icon name="refresh" size={14} />
              <span className="btn-content">Re-sync from the records</span>
            </Button>
          )}
          {thread?.can_manage_members && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onArchive(!thread.is_archived)}
              disabled={busy}
              loading={busyKey === 'archive'}
            >
              <span className="btn-content">{thread.is_archived ? 'Reopen' : 'Archive'}</span>
            </Button>
          )}
          {/* Leaving is the one action here that cannot be undone from this
              screen, so the first press only arms it. */}
          <Button
            size="sm"
            variant={confirmLeave && !busy ? 'danger' : 'ghost'}
            onClick={() => {
              if (confirmLeave && !busy) {
                onLeave()
                setConfirmLeave(false)
                return
              }
              setConfirmLeave((armed) => !armed)
            }}
            disabled={busy && busyKey !== 'leave'}
            loading={busyKey === 'leave'}
          >
            <span className="btn-content">
              {busyKey === 'leave' ? 'Leaving…' : confirmLeave ? 'Tap again to leave' : 'Leave conversation'}
            </span>
          </Button>
        </section>

        <section className="details-block">
          <h3 className="section-title">Notifications</h3>
          <PushPreferences />
        </section>
      </div>
    </aside>
  )
}
