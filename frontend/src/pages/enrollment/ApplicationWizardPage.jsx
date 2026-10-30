import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'
import { ButtonLoader } from '../../components/loading'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import api, {
  API_BASE,
  authHeader,
  getGuestToken,
  getStoredToken,
  setGuestToken,
} from '../../services/api'
import useFetch from '../../hooks/useFetch'
import {
  ENROLLMENT_TYPES,
  ENROLLMENT_TYPE_OPTIONS,
  applicationStatus,
  documentStatus,
  isSeniorHigh,
} from '../../utils/enrollment'
import { formatDate } from '../../utils/format'
import './EnrollmentPages.css'

const STEPS = [
  { key: 1, label: 'Enrollment details' },
  { key: 2, label: 'Student information' },
  { key: 3, label: 'Parent / guardian' },
  { key: 4, label: 'Documents' },
  { key: 5, label: 'Review & submit' },
]

const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx'

const EMPTY_DETAILS = {
  period: '',
  enrollment_type: 'new',
  grade_level: '',
  strand: '',
  previous_school: '',
  previous_school_address: '',
}

const EMPTY_STUDENT = {
  lrn: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  date_of_birth: '',
  sex: '',
  address: '',
  contact_number: '',
}

const EMPTY_GUARDIAN = {
  guardian_name: '',
  guardian_relationship: '',
  guardian_contact: '',
  guardian_email: '',
}

function toResults(data) {
  if (Array.isArray(data)) return data
  return (data && data.results) || []
}

function detailToDetailsForm(detail, previous) {
  return {
    period: detail.period ? String(detail.period) : previous.period,
    enrollment_type: detail.enrollment_type || 'new',
    grade_level: detail.grade_level ? String(detail.grade_level) : '',
    strand: detail.strand || '',
    previous_school: detail.previous_school || '',
    previous_school_address: detail.previous_school_address || '',
  }
}

function detailToStudentForm(detail) {
  return {
    lrn: detail.lrn || '',
    first_name: detail.first_name || '',
    middle_name: detail.middle_name || '',
    last_name: detail.last_name || '',
    date_of_birth: detail.date_of_birth || '',
    sex: detail.sex || '',
    address: detail.address || '',
    contact_number: detail.contact_number || '',
  }
}

function detailToGuardianForm(detail) {
  return {
    guardian_name: detail.guardian_name || '',
    guardian_relationship: detail.guardian_relationship || '',
    guardian_contact: detail.guardian_contact || '',
    guardian_email: detail.guardian_email || '',
  }
}

/** Flatten a DRF {field: [messages]} payload into field → message. */
function fieldErrorsFrom(err) {
  const mapped = {}
  if (err && err.details && typeof err.details === 'object') {
    Object.entries(err.details).forEach(([key, value]) => {
      mapped[key] = Array.isArray(value) ? value.join(' ') : String(value)
    })
  }
  return mapped
}

/**
 * Upload one requirement file. The shared api client always JSON-serializes
 * its body, so multipart uploads go through fetch directly with the shared
 * auth header (Token for signed-in users, Guest for account-less applicants)
 * — the browser sets the multipart boundary itself.
 */
async function uploadDocumentFile(applicationId, docId, file) {
  const headers = authHeader()
  const formData = new FormData()
  formData.append('file', file)

  let response
  try {
    response = await fetch(
      `${API_BASE}/enrollment/applications/my/${applicationId}/documents/${docId}/upload/`,
      {
        method: 'POST',
        headers: Object.keys(headers).length ? headers : undefined,
        body: formData,
      }
    )
  } catch {
    throw new Error(
      'Cannot reach the server. Check your connection and try again.'
    )
  }

  if (!response.ok) {
    let payload = null
    const text = await response.text()
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = text
      }
    }
    let message = `Upload failed (${response.status}).`
    if (typeof payload === 'string' && payload) message = payload
    else if (payload && payload.detail) message = payload.detail
    else if (payload && typeof payload === 'object') {
      message = Object.entries(payload)
        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(' ') : value}`)
        .join(' ')
    }
    throw new Error(message)
  }

  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** Multi-step enrollment application: draft → details → documents → submit. */
export default function ApplicationWizardPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const resumeId = searchParams.get('application')
  const queryPeriod =
    searchParams.get('period') ||
    (location.state && location.state.periodId) ||
    ''

  const [step, setStep] = useState(1)
  const [resumeLoading, setResumeLoading] = useState(Boolean(resumeId))
  const [resumeError, setResumeError] = useState(null)

  const [applicationId, setApplicationId] = useState(null)
  const [application, setApplication] = useState(null)

  const [details, setDetails] = useState(() => ({
    ...EMPTY_DETAILS,
    period: queryPeriod ? String(queryPeriod) : '',
  }))
  const [student, setStudent] = useState(EMPTY_STUDENT)
  const [guardian, setGuardian] = useState(EMPTY_GUARDIAN)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  // Sections persisted to the server during this session — the "Saved" badge
  // only appears on a step whose own section is saved-and-clean, so it can
  // never confirm data the user hasn't actually saved yet.
  const [savedSections, setSavedSections] = useState({})
  const [duplicate, setDuplicate] = useState(false)
  // Set when the duplicate is a public (guest) applicant's own application:
  // its id lets the banner link straight to it instead of dead-ending.
  const [duplicateAppId, setDuplicateAppId] = useState(null)
  const [dirty, setDirty] = useState({
    details: false,
    student: false,
    guardian: false,
  })

  const [uploads, setUploads] = useState({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const submitBusyRef = useRef(false)
  const stepHeadingRef = useRef(null)
  const prevStepRef = useRef(1)

  const {
    data: periodData,
    loading: periodsLoading,
    error: periodsError,
    reload: reloadPeriods,
  } = useFetch('/enrollment/periods/')
  const {
    data: gradeData,
    loading: gradesLoading,
    error: gradesError,
    reload: reloadGrades,
  } = useFetch('/grade-levels/', { list: true })

  const periods = toResults(periodData)
  const openPeriods = periods.filter((p) => p.is_accepting_applications)
  const gradeLevels = gradeData || []
  const selectedGrade = gradeLevels.find(
    (g) => String(g.id) === String(details.grade_level)
  )
  const showStrand = selectedGrade ? isSeniorHigh(selectedGrade.name) : false

  /** Adopt a server copy of the application into local state. */
  function applyDetail(detail) {
    setApplication(detail)
    setApplicationId(detail.id)
    setDetails((prev) => detailToDetailsForm(detail, prev))
    setStudent(detailToStudentForm(detail))
    setGuardian(detailToGuardianForm(detail))
    setDirty({ details: false, student: false, guardian: false })
    setSavedSections({})
    setError(null)
  }

  // Resume an existing draft (?application=<id>). Anything that already left
  // the draft state belongs on the detail page — redirect instead of editing.
  useEffect(() => {
    if (!resumeId) return undefined
    let cancelled = false
    setResumeLoading(true)
    api
      .get(`/enrollment/applications/my/${resumeId}/`)
      .then((detail) => {
        if (cancelled) return
        if (detail.status !== 'draft') {
          navigate(`../applications/${detail.id}`, { replace: true })
          return
        }
        applyDetail(detail)
        setStep(2)
      })
      .catch((err) => {
        if (!cancelled) setResumeError(err)
      })
      .finally(() => {
        if (!cancelled) setResumeLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId])

  // Warn before the tab closes while any step holds unsaved edits.
  const anyDirty = dirty.details || dirty.student || dirty.guardian
  useEffect(() => {
    if (!anyDirty) return undefined
    function warn(event) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [anyDirty])

  // After a step change, move focus to the new step's heading so keyboard
  // and screen-reader users land on the content that changed.
  useEffect(() => {
    if (prevStepRef.current === step) return
    prevStepRef.current = step
    if (stepHeadingRef.current) stepHeadingRef.current.focus()
  }, [step])

  function markDirty(section) {
    setDirty((prev) => ({ ...prev, [section]: true }))
    setSavedSections((prev) => {
      if (!prev[section]) return prev
      const next = { ...prev }
      delete next[section]
      return next
    })
  }

  function markSaved(section) {
    setDirty((prev) => ({ ...prev, [section]: false }))
    setSavedSections((prev) => ({ ...prev, [section]: true }))
  }

  function update(section, field, value) {
    if (section === 'student') setStudent((prev) => ({ ...prev, [field]: value }))
    else if (section === 'guardian') setGuardian((prev) => ({ ...prev, [field]: value }))
    else setDetails((prev) => ({ ...prev, [field]: value }))
    markDirty(section)
  }

  function detailsPayload() {
    return {
      enrollment_type: details.enrollment_type,
      grade_level: Number(details.grade_level),
      strand: details.strand.trim(),
      previous_school: details.previous_school.trim(),
      previous_school_address: details.previous_school_address.trim(),
    }
  }

  function studentPayload() {
    return {
      lrn: student.lrn.trim(),
      first_name: student.first_name.trim(),
      middle_name: student.middle_name.trim(),
      last_name: student.last_name.trim(),
      date_of_birth: student.date_of_birth || null,
      sex: student.sex || '',
      address: student.address.trim(),
      contact_number: student.contact_number.trim(),
    }
  }

  function guardianPayload() {
    return {
      guardian_name: guardian.guardian_name.trim(),
      guardian_relationship: guardian.guardian_relationship.trim(),
      guardian_contact: guardian.guardian_contact.trim(),
      guardian_email: guardian.guardian_email.trim(),
    }
  }

  function validateDetails(requirePeriod) {
    const errors = {}
    if (requirePeriod && !details.period) {
      errors.period = 'Choose an enrollment period.'
    }
    if (!details.enrollment_type) {
      errors.enrollment_type = 'Choose the enrollment type.'
    }
    if (!details.grade_level) {
      errors.grade_level = 'Choose the grade level you are enrolling in.'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function patchApplication(payload) {
    const detail = await api.patch(
      `/enrollment/applications/my/${applicationId}/`,
      payload
    )
    setApplication(detail)
    setDetails((prev) => detailToDetailsForm(detail, prev))
    setStudent(detailToStudentForm(detail))
    setGuardian(detailToGuardianForm(detail))
    return detail
  }

  async function createDraft() {
    if (!validateDetails(true)) return
    setBusy(true)
    setError(null)
    setDuplicate(false)
    try {
      const created = await api.post('/enrollment/applications/my/', {
        period: Number(details.period),
        ...detailsPayload(),
      })
      // A guest (account-less) draft create returns the one-time guest
      // credential — store it before any follow-up request so they keep
      // access to their own application.
      if (created && created.guest_token) setGuestToken(created.guest_token)
      let detail = created
      try {
        detail = await api.get(`/enrollment/applications/my/${created.id}/`)
      } catch {
        // The create response already carries the detail shape.
      }
      applyDetail(detail)
      setStep(2)
    } catch (err) {
      if (
        err &&
        err.status === 400 &&
        /already (?:have an active application|has an open application)/i.test(
          err.message || '',
        )
      ) {
        // Shown once in the info banner below (with the way back), not twice.
        setDuplicate(err.message)
        // A public (guest) applicant's copy lives behind their browser token
        // — resolve it so the banner offers "Open my application" directly.
        if (!getStoredToken() && getGuestToken()) {
          try {
            const mine = await api.get('/enrollment/applications/my/', {
              params: { page_size: 1 },
            })
            const first = mine && Array.isArray(mine.results) ? mine.results[0] : null
            if (first) setDuplicateAppId(first.id)
          } catch {
            /* banner still offers the generic path below */
          }
        }
      } else {
        setError(err.message)
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleDetailsSubmit(event) {
    event.preventDefault()
    if (busy) return
    if (!applicationId) {
      await createDraft()
      return
    }
    if (!validateDetails(false)) return
    setBusy(true)
    setError(null)
    try {
      await patchApplication(detailsPayload())
      markSaved('details')
      setStep(2)
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err))
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleStudentSubmit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await patchApplication(studentPayload())
      markSaved('student')
      setStep(3)
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err))
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleGuardianSubmit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await patchApplication(guardianPayload())
      markSaved('guardian')
      setStep(4)
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err))
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  /** Step back — PATCH the section being left (steps 2 and 3 save on leave). */
  async function handleBack() {
    if (busy || step <= 1) return
    setBusy(true)
    setError(null)
    try {
      if (step === 2) {
        await patchApplication(studentPayload())
        markSaved('student')
      } else if (step === 3) {
        await patchApplication(guardianPayload())
        markSaved('guardian')
      }
      setStep((s) => s - 1)
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err))
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleUpload(docId, file) {
    if (!file || uploads[docId]?.busy) return
    setUploads((prev) => ({ ...prev, [docId]: { busy: true, error: null } }))
    try {
      await uploadDocumentFile(applicationId, docId, file)
      const detail = await api.get(`/enrollment/applications/my/${applicationId}/`)
      setApplication(detail)
      setUploads((prev) => ({ ...prev, [docId]: { busy: false, error: null } }))
    } catch (err) {
      setUploads((prev) => ({
        ...prev,
        [docId]: { busy: false, error: err.message },
      }))
    }
  }

  function openSubmitConfirm() {
    const missing = (application && application.missing_documents) || []
    if (missing.length > 0) {
      setSubmitError(
        `Upload the missing required documents before submitting: ${missing.join(', ')}.`
      )
      return
    }
    setSubmitError(null)
    setConfirmOpen(true)
  }

  async function confirmSubmit() {
    if (submitBusyRef.current) return
    submitBusyRef.current = true
    setSubmitting(true)
    setSubmitError(null)
    try {
      await api.post(`/enrollment/applications/my/${applicationId}/submit/`)
      navigate(`../applications/${applicationId}?submitted=1`)
    } catch (err) {
      setConfirmOpen(false)
      setSubmitError(err.message)
    } finally {
      submitBusyRef.current = false
      setSubmitting(false)
    }
  }

  /** aria helpers so every input wires its own error properly. */
  function wizField(name, prefix) {
    const id = `${prefix}-${name}`
    return {
      id,
      className: 'input',
      'aria-invalid': fieldErrors[name] ? 'true' : undefined,
      'aria-describedby': fieldErrors[name] ? `${id}-err` : undefined,
    }
  }

  const errorNode = (name, prefix) =>
    fieldErrors[name] ? (
      <span className="field-error" id={`${prefix}-${name}-err`}>
        <Icon name="info" size={13} />
        {fieldErrors[name]}
      </span>
    ) : null

  if (resumeLoading) {
    return (
      <div className="stack stack-md">
        <PageHeader title="Enrollment application" subtitle="Loading your draft…" />
        <div className="alert alert-info" role="status">
          <Icon name="refresh" size={16} />
          <span>Loading your application…</span>
        </div>
      </div>
    )
  }

  if (resumeError) {
    return (
      <div className="stack stack-md">
        <PageHeader title="Enrollment application" />
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={18} />
          <div className="grow stack stack-xs">
            <strong className="alert-title">Could not load this application</strong>
            <span>{resumeError.message}</span>
            <div>
              <Link className="btn btn-sm btn-secondary" to="..">
                Back to my applications
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const appStatus = application ? applicationStatus(application.status) : null

  return (
    <div className="stack stack-md">
      <PageHeader
        title="Enrollment application"
        subtitle={
          application
            ? `Draft ${application.reference} — complete each step; your answers are saved on the server as you go.`
            : 'Complete each step. A draft is created on the server as soon as you finish the first one.'
        }
        actions={
          appStatus ? <StatusBadge label={appStatus.label} tone={appStatus.tone} /> : null
        }
      />

      <div className="enr-steps-wrap">
        <ol className="enr-steps" aria-label="Application steps">
          {STEPS.map((s) => {
            const state =
              step === s.key ? ' is-active' : step > s.key ? ' is-done' : ''
            return (
              <li
                key={s.key}
                className={`enr-step${state}`}
                aria-current={step === s.key ? 'step' : undefined}
              >
                <span className="enr-step-num" aria-hidden="true">
                  {step > s.key ? <Icon name="check" size={12} /> : s.key}
                </span>
                <span>{s.label}</span>
              </li>
            )
          })}
        </ol>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={16} />
          <span className="grow">{error}</span>
        </div>
      )}

      {duplicate && (
        <div className="alert alert-info" role="alert">
          <Icon name="info" size={16} />
          <span className="grow">{duplicate}</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() =>
              navigate(
                duplicateAppId ? `/enroll/applications/${duplicateAppId}` : '..',
              )
            }
          >
            {duplicateAppId ? 'Open my application' : 'Go to my applications'}
          </button>
        </div>
      )}

      {submitError && (
        <div className="alert alert-error" role="alert">
          <Icon name="info" size={16} />
          <span className="grow">{submitError}</span>
        </div>
      )}

      {/* ---------------------------------------------------- Step 1 ---- */}
      {step === 1 && (
        <form className="card card-pad stack stack-sm" onSubmit={handleDetailsSubmit} noValidate>
          <h2 className="enr-form-title" tabIndex={-1} ref={stepHeadingRef}>
            Enrollment details
          </h2>

          {applicationId ? (
            <div className="field">
              <span className="eyebrow">Enrollment period</span>
              <p style={{ margin: 0 }}>{application?.period_label || '—'}</p>
              <span className="hint">The enrollment period is fixed once a draft exists.</span>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="wiz-period">Enrollment period</label>
              {periodsLoading && !periodData ? (
                <select id="wiz-period" className="select" disabled>
                  <option>Loading enrollment periods…</option>
                </select>
              ) : periodsError ? (
                <div className="alert alert-error" role="alert">
                  <Icon name="info" size={15} />
                  <span className="grow">Could not load enrollment periods.</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={reloadPeriods}
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <>
                  <select
                    {...wizField('period', 'wiz')}
                    className="select"
                    value={details.period}
                    onChange={(e) => update('details', 'period', e.target.value)}
                    disabled={busy}
                  >
                    <option value="">Choose an enrollment period…</option>
                    {openPeriods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.school_year_label}
                      </option>
                    ))}
                  </select>
                  {openPeriods.length === 0 && (
                    <span className="hint">No enrollment periods are open right now.</span>
                  )}
                </>
              )}
              {errorNode('period', 'wiz')}
            </div>
          )}

          <div className="field">
            <label htmlFor="wiz-enrollment_type">Enrollment type</label>
            <select
              {...wizField('enrollment_type', 'wiz')}
              className="select"
              value={details.enrollment_type}
              onChange={(e) => update('details', 'enrollment_type', e.target.value)}
              disabled={busy}
            >
              {ENROLLMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {errorNode('enrollment_type', 'wiz')}
          </div>

          <div className="field">
            <label htmlFor="wiz-grade_level">Grade level</label>
            {gradesLoading && !gradeData ? (
              <select id="wiz-grade_level" className="select" disabled>
                <option>Loading grade levels…</option>
              </select>
            ) : gradesError ? (
              <div className="alert alert-error" role="alert">
                <Icon name="info" size={15} />
                <span className="grow">Could not load grade levels.</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={reloadGrades}
                >
                  Try again
                </button>
              </div>
            ) : (
              <select
                {...wizField('grade_level', 'wiz')}
                className="select"
                value={details.grade_level}
                onChange={(e) => update('details', 'grade_level', e.target.value)}
                disabled={busy}
              >
                <option value="">Choose a grade level…</option>
                {gradeLevels.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
            {errorNode('grade_level', 'wiz')}
          </div>

          {showStrand && (
            <div className="field">
              <label htmlFor="wiz-strand">Senior High strand</label>
              <input
                {...wizField('strand', 'wiz')}
                value={details.strand}
                onChange={(e) => update('details', 'strand', e.target.value)}
                disabled={busy}
                placeholder="e.g. STEM, ABM, HUMSS"
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="wiz-previous_school">Previous school (optional)</label>
            <input
              {...wizField('previous_school', 'wiz')}
              value={details.previous_school}
              onChange={(e) => update('details', 'previous_school', e.target.value)}
              disabled={busy}
              placeholder="Name of the last school attended"
            />
          </div>

          <div className="field">
            <label htmlFor="wiz-previous_school_address">Previous school address (optional)</label>
            <input
              {...wizField('previous_school_address', 'wiz')}
              value={details.previous_school_address}
              onChange={(e) =>
                update('details', 'previous_school_address', e.target.value)
              }
              disabled={busy}
            />
          </div>

          <div className="row row-between row-wrap">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                // A draft already on the server keeps its saved answers; only
                // edits made on this step since the last save are lost.
                if (anyDirty) setCancelOpen(true)
                else navigate('..')
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || (!applicationId && (periodsLoading || gradesLoading))}
            >
              {busy && <ButtonLoader />}
              {busy
                ? 'Working…'
                : applicationId
                  ? 'Save & continue'
                  : 'Create draft & continue'}
            </button>
          </div>
        </form>
      )}

      {/* ---------------------------------------------------- Step 2 ---- */}
      {step === 2 && (
        <form className="card card-pad stack stack-sm" onSubmit={handleStudentSubmit} noValidate>
          <h2 className="enr-form-title" tabIndex={-1} ref={stepHeadingRef}>
            Student information
          </h2>
          <p className="subtle" style={{ margin: 0 }}>
            Prefilled from your TRACK profile where possible — check every field before
            continuing.
          </p>

          <div className="field">
            <label htmlFor="wiz-lrn">Learner Reference Number (LRN)</label>
            <input
              {...wizField('lrn', 'wiz')}
              value={student.lrn}
              onChange={(e) => update('student', 'lrn', e.target.value)}
              disabled={busy}
              maxLength={12}
              placeholder="12-digit LRN"
            />
            {errorNode('lrn', 'wiz')}
          </div>

          <div className="row row-wrap">
            <div className="field grow">
              <label htmlFor="wiz-first_name">First name</label>
              <input
                {...wizField('first_name', 'wiz')}
                value={student.first_name}
                onChange={(e) => update('student', 'first_name', e.target.value)}
                disabled={busy}
              />
              {errorNode('first_name', 'wiz')}
            </div>
            <div className="field grow">
              <label htmlFor="wiz-middle_name">Middle name (optional)</label>
              <input
                id="wiz-middle_name"
                className="input"
                value={student.middle_name}
                onChange={(e) => update('student', 'middle_name', e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="field grow">
              <label htmlFor="wiz-last_name">Last name</label>
              <input
                {...wizField('last_name', 'wiz')}
                value={student.last_name}
                onChange={(e) => update('student', 'last_name', e.target.value)}
                disabled={busy}
              />
              {errorNode('last_name', 'wiz')}
            </div>
          </div>

          <div className="row row-wrap">
            <div className="field grow">
              <label htmlFor="wiz-date_of_birth">Date of birth</label>
              <input
                {...wizField('date_of_birth', 'wiz')}
                type="date"
                value={student.date_of_birth}
                onChange={(e) => update('student', 'date_of_birth', e.target.value)}
                disabled={busy}
              />
              {errorNode('date_of_birth', 'wiz')}
            </div>
            <div className="field grow">
              <label htmlFor="wiz-sex">Sex</label>
              <select
                id="wiz-sex"
                className="select"
                value={student.sex}
                onChange={(e) => update('student', 'sex', e.target.value)}
                disabled={busy}
              >
                <option value="">Not specified</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="wiz-address">Home address</label>
            <input
              {...wizField('address', 'wiz')}
              value={student.address}
              onChange={(e) => update('student', 'address', e.target.value)}
              disabled={busy}
            />
            {errorNode('address', 'wiz')}
          </div>

          <div className="field">
            <label htmlFor="wiz-contact_number">Contact number</label>
            <input
              {...wizField('contact_number', 'wiz')}
              value={student.contact_number}
              onChange={(e) => update('student', 'contact_number', e.target.value)}
              disabled={busy}
              placeholder="e.g. 0917 123 4567"
            />
            {errorNode('contact_number', 'wiz')}
          </div>

          <div className="row row-between row-wrap">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleBack}
              disabled={busy}
            >
              Back
            </button>
            <div className="row row-wrap gap-sm">
              {savedSections.student && (
                <span className="enr-saved" role="status">
                  <Icon name="check" size={13} /> Saved
                </span>
              )}
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy && <ButtonLoader />}
                {busy ? 'Saving…' : 'Save & continue'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ---------------------------------------------------- Step 3 ---- */}
      {step === 3 && (
        <form className="card card-pad stack stack-sm" onSubmit={handleGuardianSubmit} noValidate>
          <h2 className="enr-form-title" tabIndex={-1} ref={stepHeadingRef}>
            Parent / guardian
          </h2>
          <p className="subtle" style={{ margin: 0 }}>
            The Registrar may contact this person about the application.
          </p>

          <div className="field">
            <label htmlFor="wiz-guardian_name">Full name</label>
            <input
              {...wizField('guardian_name', 'wiz')}
              value={guardian.guardian_name}
              onChange={(e) => update('guardian', 'guardian_name', e.target.value)}
              disabled={busy}
            />
            {errorNode('guardian_name', 'wiz')}
          </div>

          <div className="row row-wrap">
            <div className="field grow">
              <label htmlFor="wiz-guardian_relationship">Relationship</label>
              <input
                {...wizField('guardian_relationship', 'wiz')}
                value={guardian.guardian_relationship}
                onChange={(e) =>
                  update('guardian', 'guardian_relationship', e.target.value)
                }
                disabled={busy}
                placeholder="e.g. Mother, Father, Guardian"
              />
              {errorNode('guardian_relationship', 'wiz')}
            </div>
            <div className="field grow">
              <label htmlFor="wiz-guardian_contact">Contact number</label>
              <input
                {...wizField('guardian_contact', 'wiz')}
                value={guardian.guardian_contact}
                onChange={(e) => update('guardian', 'guardian_contact', e.target.value)}
                disabled={busy}
                placeholder="e.g. 0917 123 4567"
              />
              {errorNode('guardian_contact', 'wiz')}
            </div>
          </div>

          <div className="field">
            <label htmlFor="wiz-guardian_email">Email (optional)</label>
            <input
              {...wizField('guardian_email', 'wiz')}
              type="email"
              value={guardian.guardian_email}
              onChange={(e) => update('guardian', 'guardian_email', e.target.value)}
              disabled={busy}
            />
            {errorNode('guardian_email', 'wiz')}
          </div>

          <div className="row row-between row-wrap">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleBack}
              disabled={busy}
            >
              Back
            </button>
            <div className="row row-wrap gap-sm">
              {savedSections.guardian && (
                <span className="enr-saved" role="status">
                  <Icon name="check" size={13} /> Saved
                </span>
              )}
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy && <ButtonLoader />}
                {busy ? 'Saving…' : 'Save & continue'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ---------------------------------------------------- Step 4 ---- */}
      {step === 4 && (
        <div className="card card-pad stack stack-sm">
          <h2 className="enr-form-title" tabIndex={-1} ref={stepHeadingRef}>
            Documents
          </h2>
          <p className="subtle" style={{ margin: 0 }}>
            Upload a clear scan or photo of each requirement. Accepted formats: PDF,
            JPG, PNG, WEBP or DOC.
          </p>

          {!application || (application.documents || []).length === 0 ? (
            <p className="subtle">
              No document requirements were configured for this enrollment period.
            </p>
          ) : (
            (application.documents || []).map((doc) => {
              const upload = uploads[doc.id] || {}
              const badge = documentStatus(doc.status)
              return (
                <div className="enr-doc" key={doc.id}>
                  <div className="enr-doc-main">
                    <span className="enr-doc-name">{doc.name}</span>
                    <div className="row row-wrap" style={{ gap: 6 }}>
                      <StatusBadge
                        label={doc.is_required ? 'Required' : 'Optional'}
                        tone={doc.is_required ? 'blue' : 'neutral'}
                      />
                      <StatusBadge label={badge.label} tone={badge.tone} />
                      {doc.original_filename && (
                        <span className="subtle">{doc.original_filename}</span>
                      )}
                    </div>
                    {doc.review_note && (
                      <span className="subtle">Reviewer note: {doc.review_note}</span>
                    )}
                    {upload.error && (
                      <span className="enr-doc-error" role="alert">
                        {upload.error}
                      </span>
                    )}
                  </div>
                  <div className="stack stack-xs">
                    <input
                      type="file"
                      id={`wiz-doc-${doc.id}`}
                      accept={FILE_ACCEPT}
                      aria-label={`Upload ${doc.name}`}
                      disabled={upload.busy || !applicationId}
                      onChange={(e) => {
                        const input = e.target
                        const file = input.files && input.files[0]
                        // Clear the value so picking the SAME file again after
                        // a failed upload still fires change.
                        input.value = ''
                        if (file) handleUpload(doc.id, file)
                      }}
                    />
                    <span className="subtle" style={{ fontSize: '0.75rem' }}>
                      {upload.busy ? 'Uploading…' : 'Upload or replace this file'}
                    </span>
                  </div>
                </div>
              )
            })
          )}

          <div className="row row-between row-wrap">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleBack}
              disabled={busy}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(5)}
              disabled={busy}
            >
              Continue to review
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- Step 5 ---- */}
      {step === 5 && application && (
        <div className="stack stack-md">
          <section className="card">
            <header className="card-header">
              <h2>Enrollment details</h2>
            </header>
            <div className="card-body">
              <dl className="enr-dl">
                <div>
                  <dt>Period</dt>
                  <dd>{application.period_label || '—'}</dd>
                </div>
                <div>
                  <dt>School year</dt>
                  <dd>{application.school_year_label || '—'}</dd>
                </div>
                <div>
                  <dt>Enrollment type</dt>
                  <dd>
                    {ENROLLMENT_TYPES[application.enrollment_type] ||
                      application.enrollment_type}
                  </dd>
                </div>
                <div>
                  <dt>Grade level</dt>
                  <dd>
                    {application.grade_level_name}
                    {application.strand ? ` — ${application.strand}` : ''}
                  </dd>
                </div>
                {application.previous_school && (
                  <div>
                    <dt>Previous school</dt>
                    <dd>{application.previous_school}</dd>
                  </div>
                )}
              </dl>
            </div>
          </section>

          <section className="card">
            <header className="card-header">
              <h2>Student information</h2>
            </header>
            <div className="card-body">
              <dl className="enr-dl">
                <div>
                  <dt>Full name</dt>
                  <dd>
                    {[application.first_name, application.middle_name, application.last_name]
                      .filter(Boolean)
                      .join(' ') || '—'}
                  </dd>
                </div>
                <div>
                  <dt>LRN</dt>
                  <dd>{application.lrn || '—'}</dd>
                </div>
                <div>
                  <dt>Date of birth</dt>
                  <dd>{application.date_of_birth ? formatDate(application.date_of_birth) : '—'}</dd>
                </div>
                <div>
                  <dt>Sex</dt>
                  <dd>
                    {application.sex
                      ? application.sex.charAt(0).toUpperCase() + application.sex.slice(1)
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>{application.address || '—'}</dd>
                </div>
                <div>
                  <dt>Contact number</dt>
                  <dd>{application.contact_number || '—'}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="card">
            <header className="card-header">
              <h2>Parent / guardian</h2>
            </header>
            <div className="card-body">
              <dl className="enr-dl">
                <div>
                  <dt>Full name</dt>
                  <dd>{application.guardian_name || '—'}</dd>
                </div>
                <div>
                  <dt>Relationship</dt>
                  <dd>{application.guardian_relationship || '—'}</dd>
                </div>
                <div>
                  <dt>Contact number</dt>
                  <dd>{application.guardian_contact || '—'}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{application.guardian_email || '—'}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="card">
            <header className="card-header">
              <h2>Documents</h2>
            </header>
            <div className="card-body stack stack-xs">
              {(application.documents || []).length === 0 && (
                <p className="subtle">No document requirements for this period.</p>
              )}
              {(application.documents || []).map((doc) => {
                const badge = documentStatus(doc.status)
                return (
                  <div className="row row-wrap" key={doc.id} style={{ gap: 8 }}>
                    <span className="grow">{doc.name}</span>
                    <StatusBadge
                      label={doc.is_required ? 'Required' : 'Optional'}
                      tone={doc.is_required ? 'blue' : 'neutral'}
                    />
                    <StatusBadge label={badge.label} tone={badge.tone} />
                  </div>
                )
              })}
            </div>
          </section>

          {(application.missing_documents || []).length > 0 && (
            <div className="alert alert-error" role="alert">
              <Icon name="info" size={16} />
              <span className="grow">
                Still missing: {(application.missing_documents || []).join(', ')}. Go
                back to the Documents step to upload them before submitting.
              </span>
            </div>
          )}

          <div className="row row-between row-wrap">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleBack}
              disabled={busy}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={openSubmitConfirm}
              disabled={busy || submitting}
            >
              {submitting && <ButtonLoader />}
              {submitting ? 'Submitting…' : 'Submit application'}
            </button>
          </div>
        </div>
      )}

      <Modal
        open={cancelOpen}
        title="Discard unsaved changes?"
        onClose={() => setCancelOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setCancelOpen(false)}
            >
              Keep editing
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setCancelOpen(false)
                navigate('..')
              }}
            >
              Discard & leave
            </button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          {applicationId
            ? 'Answers you changed on this step have not been saved yet. Anything already saved stays in your draft.'
            : 'Your answers on this step have not been saved yet. Leaving now discards them.'}
        </p>
      </Modal>

      <Modal
        open={confirmOpen}
        title="Submit application?"
        onClose={() => !submitting && setConfirmOpen(false)}
        dismissible={!submitting}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={confirmSubmit}
              disabled={submitting}
            >
              {submitting && <ButtonLoader />}
              {submitting ? 'Submitting…' : 'Submit now'}
            </button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          Submit now? You can no longer edit the application until the Registrar
          reviews it.
        </p>
      </Modal>
    </div>
  )
}
