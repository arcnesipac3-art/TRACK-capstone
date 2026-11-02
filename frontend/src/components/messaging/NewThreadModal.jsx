import { useMemo, useState } from 'react'
import Button from '../Button'
import Icon from '../Icon'
import Modal from '../Modal'
import Tabs from '../Tabs'
import api from '../../services/api'
import { initials, roleLabel } from '../../utils/format'

/**
 * Starting a thread.
 *
 * The dialog offers what `/api/messaging/options/` says this account may
 * create — the classes it teaches, the departments it administers — and the
 * people `/api/messaging/contacts/` returned, which is already the server's
 * answer to "who may this person message". Creating anything else is refused
 * by the endpoint regardless of what is rendered here.
 */
export default function NewThreadModal({ open, onClose, options, contacts, onCreated }) {
  const [tab, setTab] = useState('person')
  const [term, setTerm] = useState('')
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState('group')
  const [sectionId, setSectionId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [memberIds, setMemberIds] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const kinds = useMemo(() => {
    const list = [{ id: 'group', label: 'Group' }]
    if ((options?.sections || []).length) list.push({ id: 'class', label: 'Class' })
    if ((options?.departments || []).length) list.push({ id: 'department', label: 'Department' })
    return list
  }, [options])

  const matches = useMemo(() => {
    const needle = term.trim().toLowerCase()
    const rows = contacts || []
    if (!needle) return rows.slice(0, 20)
    return rows
      .filter((row) =>
        `${row.full_name} ${row.username} ${row.detail}`.toLowerCase().includes(needle)
      )
      .slice(0, 20)
  }, [contacts, term])

  async function create(body) {
    setBusy(true)
    setError(null)
    try {
      const thread = await api.post('/messaging/conversations/', body)
      onCreated(thread)
      onClose()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title="New conversation" onClose={onClose} width={620}>
      <div className="stack stack-md">
        <Tabs
          label="Conversation type"
          idPrefix="new-thread"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'person', label: 'A person' },
            ...(options?.can_create_group ? [{ id: 'group', label: 'A group' }] : []),
          ]}
        />

        {error && <p className="alert alert-error">{error.message}</p>}

        {tab === 'person' && (
          <div className="stack stack-xs" role="tabpanel" id="new-thread-panel-person">
            <label className="field">
              <span className="visually-hidden">Find a person</span>
              <span className="search-field">
                <Icon name="search" size={15} />
                <input
                  className="input input-sm"
                  type="search"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="Name, username or class"
                />
              </span>
            </label>
            {matches.length === 0 ? (
              <p className="subtle">No reachable person by that name.</p>
            ) : (
              <ul className="picker-list">
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
                      variant="secondary"
                      disabled={busy}
                      onClick={() => create({ kind: 'direct', target_user_id: row.id })}
                    >
                      Message
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="subtle">
              Only people TRACK lets this account write to are listed — a teacher sees their own
              classes, a student sees classmates, teachers and their own parents.
            </p>
          </div>
        )}

        {tab === 'group' && (
          <div className="stack stack-md">
            <label className="field">
              <span className="field-legend">Type</span>
              <select
                className="select"
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value)
                  setMemberIds([])
                }}
              >
                {kinds.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-legend">Name</span>
              <input
                className="input"
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Chess club"
              />
            </label>

            {kind === 'class' && (
              <label className="field">
                <span className="field-legend">Class</span>
                <select
                  className="select"
                  value={sectionId}
                  onChange={(event) => setSectionId(event.target.value)}
                >
                  <option value="">Pick a class…</option>
                  {(options?.sections || []).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {kind === 'department' && (
              <label className="field">
                <span className="field-legend">Department</span>
                <select
                  className="select"
                  value={departmentId}
                  onChange={(event) => setDepartmentId(event.target.value)}
                >
                  <option value="">Pick a department…</option>
                  {(options?.departments || []).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {kind === 'group' && (
              <div className="field">
                <span className="field-legend">First members</span>
                <div className="check-scroll">
                  {matches.map((row) => (
                    <label className="checkbox-row" key={row.id}>
                      <input
                        type="checkbox"
                        checked={memberIds.includes(row.id)}
                        onChange={(event) =>
                          setMemberIds((current) =>
                            event.target.checked
                              ? [...current, row.id]
                              : current.filter((id) => id !== row.id)
                          )
                        }
                      />
                      <span>{row.full_name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <p className="subtle">
              {kind === 'class'
                ? 'A class thread enrolls the section’s students, their parents and the teachers assigned to it, and re-checks that roster every time it is opened.'
                : kind === 'department'
                  ? 'A department thread holds the administrators of that department.'
                  : 'Only people you may message can be added.'}
            </p>

            <Button
              loading={busy}
              loadingLabel="Creating…"
              disabled={!title.trim() || (kind === 'class' && !sectionId) || (kind === 'department' && !departmentId)}
              onClick={() =>
                create({
                  kind,
                  title: title.trim(),
                  ...(kind === 'class' ? { section_id: Number(sectionId) } : {}),
                  ...(kind === 'department' ? { department_id: Number(departmentId) } : {}),
                  ...(kind === 'group' ? { member_ids: memberIds } : {}),
                })
              }
            >
              Create conversation
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
