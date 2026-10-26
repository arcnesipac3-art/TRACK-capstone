/**
 * TRACK — enrollment domain labels, tones and helpers shared by the
 * applicant and Registrar portals.
 */

import { authHeader } from '../services/api';

export const APPLICATION_STATUS = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Submitted', tone: 'blue' },
  under_review: { label: 'Under Review', tone: 'blue' },
  incomplete: { label: 'Corrections Required', tone: 'amber' },
  resubmitted: { label: 'Resubmitted', tone: 'blue' },
  accepted: { label: 'Accepted', tone: 'green' },
  waitlisted: { label: 'Waitlisted', tone: 'amber' },
  rejected: { label: 'Rejected', tone: 'red' },
  enrolled: { label: 'Enrolled', tone: 'green' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export function applicationStatus(status) {
  return APPLICATION_STATUS[status] || { label: status || 'Unknown', tone: 'neutral' };
}

export const DOCUMENT_STATUS = {
  not_submitted: { label: 'Not Submitted', tone: 'neutral' },
  submitted: { label: 'Awaiting Review', tone: 'blue' },
  verified: { label: 'Verified', tone: 'green' },
  returned: { label: 'Returned for Correction', tone: 'amber' },
  waived: { label: 'Waived', tone: 'green' },
};

export function documentStatus(status) {
  return DOCUMENT_STATUS[status] || { label: status || 'Unknown', tone: 'neutral' };
}

export const ENROLLMENT_TYPES = {
  new: 'New enrollee',
  returning: 'Returning student',
  transferee: 'Transferee',
};

export const ENROLLMENT_TYPE_OPTIONS = [
  { value: 'new', label: 'New enrollee' },
  { value: 'returning', label: 'Returning student' },
  { value: 'transferee', label: 'Transferee' },
];

export const PERIOD_STATUS = {
  upcoming: { label: 'Upcoming', tone: 'neutral' },
  open: { label: 'Open', tone: 'green' },
  closed: { label: 'Closed', tone: 'red' },
};

export function periodStatus(status) {
  return PERIOD_STATUS[status] || { label: status || 'Unknown', tone: 'neutral' };
}

/** True when the grade level name looks like Senior High School (11–12). */
export function isSeniorHigh(gradeLevelName) {
  return /grade\s*1[12]/i.test(gradeLevelName || '');
}

/**
 * Download an authorized document. A plain <a href> cannot carry the
 * Authorization header, so the file is fetched as a blob first. Guests
 * (account-less applicants) download with their guest credential.
 */
export async function downloadAuthorizedFile(apiBase, path, filename) {
  const headers = authHeader();
  const response = await fetch(`${apiBase}/${path}`, {
    headers: Object.keys(headers).length ? headers : undefined,
  });
  if (!response.ok) {
    throw new Error('The file could not be downloaded.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || 'document';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
