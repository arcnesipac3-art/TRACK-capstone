/**
 * TRACK — clearance domain labels and tones.
 *
 * The words here come from the same choice sets Django stores, so a status
 * reads the same in the queue, on the learner's page and in the certificate.
 * Nothing about *which offices* take part is written here — that is
 * configuration the school owns, and the screens read it from the API.
 */

export const PERIOD_STATUS = {
  draft: { label: 'Draft', tone: 'neutral' },
  active: { label: 'Active', tone: 'green' },
  closed: { label: 'Closed', tone: 'amber' },
  archived: { label: 'Archived', tone: 'neutral' },
};

export const CLEARANCE_TYPES = {
  end_of_year: 'End of School Year',
  semester: 'Semester',
  graduation: 'Graduation',
  transfer: 'Transfer / Withdrawal',
  custom: 'Custom',
};

export const CLEARANCE_TYPE_OPTIONS = Object.entries(CLEARANCE_TYPES).map(
  ([value, label]) => ({ value, label })
);

/** The learner's standing across the whole clearance. */
export const OVERALL_STATUS = {
  in_progress: { label: 'In Progress', tone: 'neutral' },
  pending_department: { label: 'Pending Department Approval', tone: 'blue' },
  ready_for_final: { label: 'Ready for Final Approval', tone: 'amber' },
  cleared: { label: 'Cleared', tone: 'green' },
  not_cleared: { label: 'Not Cleared', tone: 'red' },
};

/** One office's sign-off on one learner. */
export const DEPARTMENT_STATUS = {
  not_started: { label: 'Not Started', tone: 'neutral' },
  pending_submission: { label: 'Pending Submission', tone: 'amber' },
  submitted: { label: 'Submitted', tone: 'blue' },
  under_review: { label: 'Under Review', tone: 'blue' },
  needs_correction: { label: 'Needs Correction', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  not_applicable: { label: 'Not Applicable', tone: 'neutral' },
};

export const SUBMISSION_STATUS = {
  not_submitted: { label: 'Not Submitted', tone: 'neutral' },
  submitted: { label: 'Awaiting Review', tone: 'blue' },
  accepted: { label: 'Accepted', tone: 'green' },
  returned: { label: 'Returned for Correction', tone: 'amber' },
};

export const OBLIGATION_STATUS = {
  open: { label: 'Outstanding', tone: 'amber' },
  resolved: { label: 'Resolved', tone: 'green' },
  waived: { label: 'Waived', tone: 'neutral' },
};

function pick(table, value) {
  return table[value] || { label: value || '—', tone: 'neutral' };
}

export const periodStatus = (value) => pick(PERIOD_STATUS, value);
export const overallStatus = (value) => pick(OVERALL_STATUS, value);
export const departmentStatus = (value) => pick(DEPARTMENT_STATUS, value);
export const submissionStatus = (value) => pick(SUBMISSION_STATUS, value);
export const obligationStatus = (value) => pick(OBLIGATION_STATUS, value);

/**
 * A status slug as its label, whichever table it belongs to.
 *
 * A history row records the slug the workflow moved *from* and *to*, and the
 * two tables share their shape but not their words — "submitted" means one
 * thing for an office and another for the whole clearance. Reading the
 * learner's own status first keeps a record's headline honest, and an unknown
 * slug is shown rather than guessed at.
 */
export function statusWord(value) {
  if (!value) return '';
  return (
    OVERALL_STATUS[value]?.label ||
    DEPARTMENT_STATUS[value]?.label ||
    SUBMISSION_STATUS[value]?.label ||
    value
  );
}

/**
 * The decisions an office can actually record, in the order a clerk reaches
 * for them. `submitted` and `not_started` are the workflow's own and are never
 * offered — the API refuses them, and a screen that offers a refusal is worse
 * than one that omits the choice.
 */
export const DECISION_OPTIONS = [
  { value: 'approved', label: 'Approve', tone: 'green', hint: 'Sign this learner off.' },
  { value: 'needs_correction', label: 'Request correction', tone: 'amber', hint: 'Send one item back for fixing.' },
  { value: 'rejected', label: 'Reject', tone: 'red', hint: 'This learner is not cleared by this office.' },
  { value: 'not_applicable', label: 'Not applicable', tone: 'neutral', hint: 'This office holds nothing against this learner.' },
];

/** Days until an ISO timestamp, floored at zero — a deadline never reads as negative. */
export function daysUntil(value) {
  if (!value) return null
  const ms = new Date(value).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86400000))
}

/** The window a period runs in, in the words the configuration screens use. */
export function openWindow(period) {
  if (!period?.opens_at || !period?.closes_at) return 'Dates not set'
  const day = (v) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return `${day(period.opens_at)} → ${day(period.closes_at)}`
}
