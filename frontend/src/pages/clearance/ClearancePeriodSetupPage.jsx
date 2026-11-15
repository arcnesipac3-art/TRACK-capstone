import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/dashboard/Card'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import Icon from '../../components/Icon'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import TableSkeleton from '../../components/loading/TableSkeleton'
import { useAuth } from '../../context/AuthContext'
import useFetch from '../../hooks/useFetch'
import api from '../../services/api'
import { overallStatus, periodStatus } from '../../utils/clearance'
import { formatDate } from '../../utils/format'
import ObligationTypeModal from './ObligationTypeModal'
import PeriodDepartmentModal from './PeriodDepartmentModal'
import PeriodFormModal from './PeriodFormModal'
import RequirementModal from './RequirementModal'
import './Clearance.css'

/** The four flags a requirement card shows, in the order they matter. */
function requirementChips(requirement) {
  return [
    requirement.is_required ? 'Required' : 'Optional',
    requirement.allows_upload ? (requirement.needs_review ? 'Filed, officer checks' : 'Filed settles it') : 'Settled at the counter',
    requirement.is_active ? null : 'Deactivated',
  ].filter(Boolean)
}

/**
 * One period's configuration: which offices take part, what each of them asks
 * of a learner, what debts each office can raise, and which learners the period
 * covers.
 *
 * Nothing here names an office. The department list is TRACK's existing
 * Department registry, so a school with a canteen and no library configures a
 * canteen and no library — the workflow reads what this screen writes.
 */
export default function ClearancePeriodSetupPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const canManage = can('clearance.manage')

  const options = useFetch('/clearance/options/')
  const period = useFetch(`/clearance/periods/${id}/`)
  const offices = useFetch(`/clearance/periods/${id}/departments/`, { list: true })
  const population = useFetch(`/clearance/periods/${id}/population/`)

  const [picked, setPicked] = useState({ period: id, office: null })
  const [officeModal, setOfficeModal] = useState(null)
  const [requirementModal, setRequirementModal] = useState(null)
  const [obligationModal, setObligationModal] = useState(null)
  const [editPeriod, setEditPeriod] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [alert, setAlert] = useState(null)

  const rows = offices.data || []
  // A different period is a different set of offices, so the selection that made
  // sense on one row cannot be carried to the next. Read it during render
  // instead of clearing it in an effect: the first paint of the new period then
  // never shows the previous period's office.
  const selectedId = picked.period === id ? picked.office : null
  const setSelectedId = (office) => setPicked({ period: id, office })
  const selected = rows.find((row) => row.id === selectedId) || rows[0] || null
  const requirements = useFetch(
    selected ? `/clearance/period-departments/${selected.id}/requirements/` : null,
    { list: true }
  )
  // The kinds come from their own endpoint rather than the options payload: an
  // options row carries only what a picker needs, and this screen also edits
  // `is_active` and the order.
  const kinds = useFetch('/clearance/obligation-types/', {
    list: true,
    params: { department: selected?.department },
    enabled: Boolean(selected),
  })

  function say(kind, text) {
    setAlert({ kind, text })
  }

  async function act(work) {
    setBusy(true)
    try {
      await work()
      return true
    } catch (err) {
      say('error', err.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  function refreshConfiguration() {
    offices.reload()
    requirements.reload()
    period.reload()
    population.reload()
  }

  async function runConfirmed() {
    const { action, office } = confirm
    if (action === 'remove-office') {
      const ok = await act(() => api.delete(`/clearance/period-departments/${office.id}/`))
      if (ok) {
        setConfirm(null)
        setSelectedId(null)
        say('success', `${office.department_name} removed from this period.`)
        refreshConfiguration()
      }
      return
    }
    if (action === 'remove-requirement') {
      const ok = await act(() => api.delete(`/clearance/requirements/${office.id}/`))
      if (ok) {
        setConfirm(null)
        say('success', `“${office.name}” removed.`)
        requirements.reload()
      }
      return
    }
    if (action === 'activate') {
      const ok = await act(() => api.post(`/clearance/periods/${id}/activate/`, {}))
      if (ok) {
        setConfirm(null)
        say('success', 'Period activated — every learner in scope now has a clearance record.')
        refreshConfiguration()
      }
      return
    }
    if (action === 'provision') {
      const ok = await act(() => api.post(`/clearance/periods/${id}/provision/`, {}))
      if (ok) {
        setConfirm(null)
        say('success', 'Learners now in scope have been added to the period.')
        refreshConfiguration()
      }
    }
  }

  const data = period.data
  const statusMeta = periodStatus(data?.status)

  return (
    <div className="stack stack-md">
      <PageHeader
        title={data?.name || 'Clearance period'}
        subtitle={
          data
            ? `${data.school_year_label} · ${data.semester_label} · ${data.type_label} · opens ${formatDate(data.opens_at)}, closes ${formatDate(data.closes_at)}`
            : 'The offices, checklists and learners of one clearance period.'
        }
        actions={
          <>
            <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
            {canManage && data && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setEditPeriod(true)}>
                  <Icon name="pencil" size={14} />
                  Edit period
                </Button>
                {data.status === 'draft' && (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setAlert(null)
                      setConfirm({ action: 'activate' })
                    }}
                  >
                    Activate period
                  </Button>
                )}
                {data.status === 'active' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setAlert(null)
                      setConfirm({ action: 'provision' })
                    }}
                  >
                    <Icon name="refresh" size={14} />
                    Backfill learners
                  </Button>
                )}
              </>
            )}
          </>
        }
      />

      {alert && (
        <div
          className={`alert ${alert.kind === 'error' ? 'alert-error' : 'alert-success'}`}
          role="alert"
        >
          <Icon name={alert.kind === 'error' ? 'info' : 'checkCircle'} size={17} />
          <span className="grow">{alert.text}</span>
          <Button variant="secondary" size="sm" onClick={() => setAlert(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {period.loading && !data && (
        <Card loading title="Configuration">
          <span className="subtle">Loading this period…</span>
        </Card>
      )}

      {!period.loading && period.error && (
        <ErrorMessage error={period.error} title="Could not load this period" onRetry={period.reload} />
      )}

      {data && (
        <>
          <div className="clr-setup">
            <section className="card">
              <header className="card-header">
                <h2>Departments</h2>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAlert(null)
                      setOfficeModal({ mode: 'new' })
                    }}
                  >
                    <Icon name="plus" size={14} />
                    Add
                  </Button>
                )}
              </header>
              <div className="card-body">
                {offices.loading && !offices.data ? (
                  <TableSkeleton headers={['Department']} rows={4} label="Loading departments…" />
                ) : rows.length === 0 ? (
                  <EmptyState
                    icon="building"
                    title="No departments in this period"
                    message="Add the offices that must sign a learner off. A period cannot activate without at least one."
                  />
                ) : (
                  <div className="clr-office-list" role="list">
                    {rows.map((office) => (
                      <button
                        type="button"
                        key={office.id}
                        role="listitem"
                        className="clr-office"
                        aria-current={selected?.id === office.id}
                        onClick={() => setSelectedId(office.id)}
                      >
                        <span>
                          <span className="clr-office-name">{office.department_name}</span>
                          <span className="clr-office-meta">
                            {office.requirement_count} requirement(s) · {office.learner_count} queue(s)
                            {office.is_active ? '' : ' · inactive'}
                          </span>
                        </span>
                        <Icon name="chevronRight" size={15} />
                      </button>
                    ))}
                  </div>
                )}
                <p className="subtle mt-xs">
                  Departments come from{' '}
                  <Link to="/admin/departments">Departments &amp; Roles</Link>; this list only
                  decides which of them take part in this period.
                </p>
              </div>
            </section>

            <div className="stack stack-md">
              {!selected ? (
                <Card title="Checklist">
                  <EmptyState
                    icon="clipboard"
                    title="Choose a department"
                    message="Pick an office on the left to see and set the requirements it holds against a learner."
                  />
                </Card>
              ) : (
                <>
                  <section className="card clr-office-card">
                    <header>
                      <div>
                        <h3>{selected.department_name}</h3>
                        <span className="subtle">
                          {selected.responsible_person_name
                            ? `Responsible: ${selected.responsible_person_name}`
                            : 'No responsible person assigned'}
                          {selected.personnel.length
                            ? ` · ${selected.personnel.map((p) => p.name).join(', ')}`
                            : ' · no officers in this department yet'}
                        </span>
                      </div>
                      <div className="clr-chips">
                        <StatusBadge
                          tone={selected.is_required ? 'blue' : 'neutral'}
                          label={selected.is_required ? 'Required' : 'Advisory'}
                        />
                        <StatusBadge
                          tone={selected.is_active ? 'green' : 'neutral'}
                          label={selected.is_active ? 'Active' : 'Inactive'}
                        />
                        {selected.period_status !== 'draft' && (
                          <span className="clr-chip">Period already {selected.period_status}</span>
                        )}
                      </div>
                    </header>

                    <p className="clr-note">
                      {selected.instructions || 'No instructions for learners yet.'}
                      {selected.deadline ? ` Deadline ${formatDate(selected.deadline)}.` : ''}
                    </p>

                    <div className="card-body">
                      {canManage && (
                        <div className="row row-wrap">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setOfficeModal(selected)}
                          >
                            <Icon name="pencil" size={14} />
                            Edit participation
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={busy}
                            onClick={() => setConfirm({ action: 'remove-office', office: selected })}
                          >
                            <Icon name="trash" size={14} />
                            Remove from period
                          </Button>
                        </div>
                      )}

                      <div className="table-wrap">
                        <table className="table responsive-table">
                          <thead>
                            <tr>
                              <th scope="col">Requirement</th>
                              <th scope="col">How it settles</th>
                              <th scope="col">Order</th>
                              <th scope="col">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {requirements.loading && !requirements.data ? (
                              <tr>
                                <td colSpan={4}>
                                  <span className="subtle">Loading requirements…</span>
                                </td>
                              </tr>
                            ) : (requirements.data || []).length === 0 ? (
                              <tr>
                                <td colSpan={4}>
                                  <span className="subtle">
                                    No requirements: this office signs a learner off from its own
                                    record, with nothing for the learner to file.
                                  </span>
                                </td>
                              </tr>
                            ) : (
                              (requirements.data || []).map((requirement) => (
                                <tr key={requirement.id}>
                                  <td data-label="Requirement" className="cell-main">
                                    {requirement.name}
                                    <span className="subtle block">
                                      {requirement.description || 'No instructions yet'}
                                    </span>
                                  </td>
                                  <td data-label="How it settles">
                                    <div className="clr-chips">
                                      {requirementChips(requirement).map((chip) => (
                                        <span className="clr-chip" key={chip}>
                                          {chip}
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                  <td data-label="Order">{requirement.position}</td>
                                  <td data-label="Actions" className="text-right">
                                    {canManage && (
                                      <div className="row-actions">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          aria-label={`Edit ${requirement.name}`}
                                          onClick={() => {
                                            setAlert(null)
                                            setRequirementModal(requirement)
                                          }}
                                        >
                                          <Icon name="pencil" size={14} />
                                          Edit
                                        </Button>
                                        <Button
                                          variant="danger"
                                          size="sm"
                                          disabled={busy}
                                          aria-label={`Remove ${requirement.name}`}
                                          onClick={() =>
                                            setConfirm({ action: 'remove-requirement', office: requirement })
                                          }
                                        >
                                          <Icon name="trash" size={14} />
                                        </Button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {canManage && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="mt-xs"
                          onClick={() => {
                            setAlert(null)
                            setRequirementModal({ mode: 'new' })
                          }}
                        >
                          <Icon name="plus" size={14} />
                          Add requirement
                        </Button>
                      )}
                    </div>
                  </section>

                  <Card
                    title={`Obligations ${selected.department_name} can raise`}
                    loading={kinds.loading && !kinds.data}
                    error={kinds.error}
                    onRetry={kinds.reload}
                    action={
                      canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAlert(null)
                            setObligationModal({ mode: 'new' })
                          }}
                        >
                          <Icon name="plus" size={14} />
                          New kind
                        </Button>
                      )
                    }
                  >
                    {(kinds.data || []).length === 0 ? (
                      <EmptyState
                        icon="alertTriangle"
                        title="No obligation kinds yet"
                        message="Define what this office can hold against a learner — a canteen balance, an unreturned book. Listing a kind never records a debt: an officer raises it against a named learner, one at a time."
                      />
                    ) : (
                      <ul className="stack stack-xs">
                        {(kinds.data || []).map((kind) => (
                          <li key={kind.id} className="row row-wrap row-between">
                            <span>
                              <strong>{kind.name}</strong>
                              <span className="subtle block">{kind.description || 'No description'}</span>
                            </span>
                            <span className="clr-chips">
                              <StatusBadge
                                tone={kind.is_blocking ? 'amber' : 'neutral'}
                                label={kind.is_blocking ? 'Blocks sign-off' : 'Advisory'}
                              />
                              <StatusBadge
                                tone={kind.is_active ? 'green' : 'neutral'}
                                label={kind.is_active ? 'Offered' : 'Retired'}
                              />
                              {canManage && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setObligationModal(kind)}
                                >
                                  <Icon name="pencil" size={14} />
                                  Edit
                                </Button>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </>
              )}

              <Card
                title="Learners this period covers"
                loading={population.loading && !population.data}
                error={population.error}
                onRetry={population.reload}
              >
                {population.data && (
                  <>
                    <div className="kpi-grid">
                      <div className="stat-card">
                        <span className="stat-label">In scope</span>
                        <span className="stat-value">{population.data.total}</span>
                        <span className="stat-hint">by grade level and category</span>
                      </div>
                      <div className="stat-card">
                        <span className="stat-label">With a record</span>
                        <span className="stat-value">{population.data.provisioned}</span>
                        <span className="stat-hint">
                          {population.data.total - population.data.provisioned} waiting for activation
                        </span>
                      </div>
                      <div className="stat-card">
                        <span className="stat-label">Outside the scope</span>
                        <span className="stat-value">{population.data.out_of_population}</span>
                        <span className="stat-hint">
                          enrolled while the period ran, then moved or withdrawn
                        </span>
                      </div>
                    </div>

                    <p className="subtle mt-xs">
                      {data.grade_levels?.length
                        ? `Grade levels: ${data.grade_levels.length} selected · `
                        : 'Every grade level · '}
                      {data.categories?.length
                        ? `${data.categories.length} learner category(ies).`
                        : 'no category filter.'}
                      {' '}Backfill after a new enrolment or a category change adds the learners who
                      joined since activation.
                    </p>

                    {population.data.learners.length > 0 && (
                      <div className="table-wrap mt-xs">
                        <table className="table responsive-table">
                          <thead>
                            <tr>
                              <th scope="col">Learner</th>
                              <th scope="col">Grade &amp; section</th>
                              <th scope="col">Categories</th>
                              <th scope="col">Clearance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {population.data.learners.slice(0, 25).map((learner) => (
                              <tr key={learner.student}>
                                <td data-label="Learner" className="cell-main">
                                  {learner.record ? (
                                    <Link to={`/admin/clearance/learners/${learner.record}`}>
                                      {learner.learner}
                                    </Link>
                                  ) : (
                                    learner.learner
                                  )}
                                  <span className="subtle block">{learner.lrn || 'No LRN'}</span>
                                </td>
                                <td data-label="Grade & section">
                                  {learner.grade_level} {learner.section ? `· ${learner.section}` : ''}
                                </td>
                                <td data-label="Categories">
                                  {learner.categories.length ? (
                                    <span className="clr-chips">
                                      {learner.categories.map((c) => (
                                        <span className="clr-chip" key={c}>
                                          {c}
                                        </span>
                                      ))}
                                    </span>
                                  ) : (
                                    <span className="subtle">—</span>
                                  )}
                                </td>
                                <td data-label="Clearance">
                                  {learner.overall_status ? (
                                    <StatusBadge
                                      tone={overallStatus(learner.overall_status).tone}
                                      label={overallStatus(learner.overall_status).label}
                                    />
                                  ) : (
                                    <span className="subtle">Not opened</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {population.data.learners.length > 25 && (
                      <p className="subtle mt-xs">
                        Showing 25 of {population.data.total} — the full list is on{' '}
                        <Link to={`/admin/clearance/learners?period=${data.id}`}>Clearance learners</Link>.
                      </p>
                    )}
                  </>
                )}
              </Card>
            </div>
          </div>

          <div className="row">
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/clearance/periods')}>
              <Icon name="arrowLeft" size={14} />
              All periods
            </Button>
          </div>
        </>
      )}

      <PeriodFormModal
        key={editPeriod ? `period-${id}` : 'closed'}
        open={editPeriod}
        period={data}
        options={options.data}
        onClose={() => setEditPeriod(false)}
        onSaved={(saved) => {
          setEditPeriod(false)
          say('success', `“${saved?.name || data.name}” saved.`)
          refreshConfiguration()
        }}
      />

      <PeriodDepartmentModal
        key={officeModal ? `office-${officeModal.id || 'new'}` : 'closed'}
        open={Boolean(officeModal)}
        periodDepartment={officeModal?.id ? officeModal : null}
        period={data}
        options={options.data}
        takenIds={rows.map((row) => row.department)}
        onClose={() => setOfficeModal(null)}
        onSaved={(saved) => {
          setOfficeModal(null)
          setSelectedId(saved?.id || selectedId)
          say('success', `${saved?.department_name || 'Department'} saved.`)
          refreshConfiguration()
        }}
      />

      <RequirementModal
        key={requirementModal ? `req-${requirementModal.id || 'new'}` : 'closed'}
        open={Boolean(requirementModal)}
        requirement={requirementModal?.id ? requirementModal : null}
        periodDepartment={selected}
        onClose={() => setRequirementModal(null)}
        onSaved={(saved) => {
          setRequirementModal(null)
          say('success', `“${saved?.name || 'Requirement'}” saved.`)
          requirements.reload()
          offices.reload()
        }}
      />

      <ObligationTypeModal
        key={obligationModal ? `kind-${obligationModal.id || 'new'}` : 'closed'}
        open={Boolean(obligationModal)}
        obligationType={obligationModal?.id ? obligationModal : null}
        options={options.data}
        defaultDepartment={selected?.department}
        onClose={() => setObligationModal(null)}
        onSaved={(saved) => {
          setObligationModal(null)
          say('success', `“${saved?.name || 'Obligation kind'}” saved.`)
          kinds.reload()
        }}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.action === 'remove-office'
            ? `Remove ${confirm?.office?.department_name}?`
            : confirm?.action === 'remove-requirement'
              ? `Remove “${confirm?.office?.name}”?`
              : confirm?.action === 'activate'
                ? 'Activate this period?'
                : 'Backfill the learners in this period?'
        }
        message={
          confirm?.action === 'remove-office'
            ? 'The office leaves this period’s queues. Learners are removed from its queue only while nothing has been recorded; if a decision or a filing exists, the server refuses and the office stays.'
            : confirm?.action === 'remove-requirement'
              ? 'This removes the requirement and any slot a learner has already filed against it. Deactivate it instead if a learner has begun working on it.'
              : confirm?.action === 'activate'
                ? 'Every learner in this period’s grade levels and categories gets a clearance record and a queue at each active department, and is notified.'
                : 'Opens a record for every learner now in scope who does not have one, and adds newly configured departments to existing records. Nothing already recorded changes.'
        }
        confirmLabel={
          confirm?.action === 'activate'
            ? 'Activate period'
            : confirm?.action === 'provision'
              ? 'Backfill now'
              : 'Remove'
        }
        tone={confirm?.action === 'activate' || confirm?.action === 'provision' ? 'primary' : 'danger'}
        onConfirm={runConfirmed}
        onCancel={() => !busy && setConfirm(null)}
      />
    </div>
  )
}
