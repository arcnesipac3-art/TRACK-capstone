import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/dashboard/Card'
import CategoryModal from './CategoryModal'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import ErrorMessage from '../../components/ErrorMessage'
import Icon from '../../components/Icon'
import ObligationTypeModal from './ObligationTypeModal'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import { useAuth } from '../../context/AuthContext'
import api from '../../services/api'
import useFetch from '../../hooks/useFetch'
import './Clearance.css'

/**
 * The two vocabularies the clearance workflow is written in.
 *
 * Everything else about a clearance is a period: when it runs, who takes part,
 * what each office asks for. What is *missing* here is exactly what must not be
 * hardcoded — the learner labels a period can target, and the kinds of debt an
 * office can record. Both are configured once and reused by every period, so a
 * school that calls its graduating learners something else never edits code.
 */
export default function ClearanceConfigurationPage() {
  const { can } = useAuth()
  const canManage = can('clearance.manage')

  const options = useFetch('/clearance/options/')
  const categories = useFetch('/clearance/categories/', { list: true })
  const kinds = useFetch('/clearance/obligation-types/', { list: true })

  const [category, setCategory] = useState(null)
  const [kind, setKind] = useState(null)
  const [kindDepartment, setKindDepartment] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const shownKinds = (kinds.data || []).filter(
    (one) => !kindDepartment || String(one.department) === String(kindDepartment)
  )

  function say(message) {
    setNotice(message)
    setError(null)
  }

  async function remove(target) {
    setBusy(true)
    setError(null)
    try {
      if (target.type === 'category') {
        await api.delete(`/clearance/categories/${target.item.id}/`)
        categories.reload()
        say(`“${target.item.name}” is no longer a learner label.`)
      } else {
        await api.delete(`/clearance/obligation-types/${target.item.id}/`)
        kinds.reload()
        say(`“${target.item.name}” is no longer offered to ${target.item.department_name}.`)
      }
      setConfirm(null)
    } catch (err) {
      // A category still scoped into a period, or a kind with obligations on it,
      // answers 409 with the reason — the school deactivates instead of deleting,
      // so the wording is shown rather than retried.
      setError(err.message)
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }

  const denied = categories.error?.status === 403 || kinds.error?.status === 403

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Clearance Configuration"
        subtitle="The learner labels a period can target, and the kinds of debt an office can record."
        actions={
          canManage && (
            <div className="row row-wrap">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setError(null)
                  setCategory({})
                }}
              >
                <Icon name="plus" size={15} />
                New learner category
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setError(null)
                  setKind({})
                }}
              >
                <Icon name="plus" size={15} />
                New obligation kind
              </Button>
            </div>
          )
        }
      />

      {denied ? (
        <Card>
          <EmptyState
            as="h2"
            icon="shield"
            title="You don't have permission"
            message="Clearance configuration needs the clearance.view permission to read, and clearance.manage to change."
          />
        </Card>
      ) : (
        <>
          {error && (
            <ErrorMessage error={error} title="That change was refused" />
          )}
          {notice && (
            <div className="alert alert-success" role="status">
              {notice}
            </div>
          )}

          <Card
            title="Learner categories"
            action={
              <span className="subtle">{(categories.data || []).length} label(s)</span>
            }
            loading={categories.loading && !categories.data}
            error={categories.error}
            onRetry={categories.reload}
            flush={(categories.data || []).length > 0}
          >
            {(categories.data || []).length > 0 ? (
              <div className="table-wrap">
                <table className="table responsive-table">
                  <thead>
                    <tr>
                      <th scope="col">Label</th>
                      <th scope="col">Learners</th>
                      <th scope="col">Used by</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.data.map((one) => (
                      <tr key={one.id}>
                        <td data-label="Label" className="cell-main">
                          {one.name}
                          <span className="subtle block">
                            {one.code}
                            {one.description ? ` · ${one.description}` : ''}
                          </span>
                        </td>
                        <td data-label="Learners">
                          {one.learner_count}
                          <span className="subtle block">
                            <Link to="/admin/clearance/learners">in the learner list</Link>
                          </span>
                        </td>
                        <td data-label="Used by">
                          {one.is_active ? (
                            <StatusBadge label="Active" tone="green" />
                          ) : (
                            <StatusBadge label="Inactive" tone="neutral" />
                          )}
                          <span className="subtle block">
                            periods pick it up when configuring a population
                          </span>
                        </td>
                        <td data-label="Actions" className="text-right">
                          <div className="row-actions">
                            {canManage && (
                              <>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    setError(null)
                                    setCategory(one)
                                  }}
                                >
                                  <Icon name="pencil" size={14} />
                                  Edit
                                </Button>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() =>
                                    setConfirm({
                                      type: 'category',
                                      item: one,
                                    })
                                  }
                                >
                                  <Icon name="trash" size={14} />
                                  Delete
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon="users"
                title="No learner categories yet"
                message={
                  canManage
                    ? 'Define the labels this school actually uses — a period with no categories covers every learner in its grade levels, which is usually what a school year wants.'
                    : 'Ask the Registrar’s office to define the learner labels this school uses.'
                }
                action={
                  canManage && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setError(null)
                        setCategory({})
                      }}
                    >
                      <Icon name="plus" size={15} />
                      New learner category
                    </Button>
                  )
                }
              />
            )}
          </Card>

          <Card
            title="Obligation kinds"
            action={
              <div className="row row-wrap gap-sm">
                <div className="field">
                  <label htmlFor="clr-cf-kind" className="subtle">
                    Office
                  </label>
                  <select
                    id="clr-cf-kind"
                    className="select"
                    value={kindDepartment}
                    onChange={(event) => setKindDepartment(event.target.value)}
                  >
                    <option value="">Every office</option>
                    {(options.data?.departments || []).map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="subtle">{shownKinds.length} kind(s)</span>
              </div>
            }
            loading={kinds.loading && !kinds.data}
            error={kinds.error}
            onRetry={kinds.reload}
            flush={shownKinds.length > 0}
          >
            {shownKinds.length > 0 ? (
              <div className="table-wrap">
                <table className="table responsive-table">
                  <thead>
                    <tr>
                      <th scope="col">Kind</th>
                      <th scope="col">Office</th>
                      <th scope="col">Effect</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownKinds.map((one) => (
                      <tr key={one.id}>
                        <td data-label="Kind" className="cell-main">
                          {one.name}
                          {one.description && (
                            <span className="subtle block">{one.description}</span>
                          )}
                        </td>
                        <td data-label="Office">{one.department_name}</td>
                        <td data-label="Effect">
                          {one.is_blocking ? (
                            <StatusBadge label="Blocks sign-off" tone="amber" />
                          ) : (
                            <StatusBadge label="Recorded only" tone="neutral" />
                          )}
                          {!one.is_active && (
                            <span className="subtle block">Not offered to officers</span>
                          )}
                        </td>
                        <td data-label="Actions" className="text-right">
                          <div className="row-actions">
                            {canManage && (
                              <>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    setError(null)
                                    setKind(one)
                                  }}
                                >
                                  <Icon name="pencil" size={14} />
                                  Edit
                                </Button>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() =>
                                    setConfirm({ type: 'kind', item: one })
                                  }
                                >
                                  <Icon name="trash" size={14} />
                                  Delete
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon="alertTriangle"
                title="No obligation kinds"
                message={
                  canManage
                    ? 'A kind is the wording an officer picks when recording something a learner owes. Nothing is raised automatically — an obligation exists only after an officer records it against a named learner.'
                    : 'This school has not defined what an office can record against a learner.'
                }
                action={
                  canManage && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setError(null)
                        setKind({})
                      }}
                    >
                      <Icon name="plus" size={15} />
                      New obligation kind
                    </Button>
                  )
                }
              />
            )}
          </Card>

          <Card title="How these two are used">
            <p className="clr-note">
              A period is configured with grade levels and, optionally, learner
              categories; activating it opens a clearance record for every learner in
              that population. A category is a fact about the learner, so it lives here
              and every period reads the same label — the school never re-types it.
            </p>
            <p className="clr-note">
              An obligation kind belongs to one office. Officers raise one against a
              learner from their own queue, and a blocking kind holds that
              office&apos;s sign-off until the obligation is settled or waived with a
              recorded reason. Deactivating a kind leaves everything already raised
              exactly as it was, which is why a kind with obligations on it cannot be
              deleted.
            </p>
          </Card>
        </>
      )}

      <CategoryModal
        open={Boolean(category)}
        category={category?.id ? category : null}
        onClose={() => setCategory(null)}
        onSaved={(saved, isEdit) => {
          setCategory(null)
          categories.reload()
          options.reload()
          say(
            isEdit
              ? `“${saved.name}” now marks ${saved.learner_count} learner(s).`
              : `“${saved.name}” is available when configuring a period.`
          )
        }}
      />

      <ObligationTypeModal
        open={Boolean(kind)}
        obligationType={kind?.id ? kind : null}
        options={options.data}
        defaultDepartment={kindDepartment || undefined}
        onClose={() => setKind(null)}
        onSaved={(saved) => {
          setKind(null)
          kinds.reload()
          say(`“${saved.name}” is recorded for ${saved.department_name}.`)
        }}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.type === 'category'
            ? `Delete “${confirm?.item.name}”?`
            : `Delete “${confirm?.item.name}”?`
        }
        message={
          confirm?.type === 'category'
            ? 'Learners carrying this label stop being targeted by it in future periods.'
            : 'Officers will no longer be able to raise this kind of obligation.'
        }
        detail={
          confirm?.type === 'category'
            ? 'A category still scoped into a clearance period is refused — remove it from those periods, or deactivate it, so the population of a running period does not change underneath it.'
            : 'A kind that obligations were already raised from is refused — those rows keep their own wording, so deactivate the kind instead.'
        }
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => remove(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
