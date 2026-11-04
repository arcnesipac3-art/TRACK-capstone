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

/** The path the authorized download endpoint answers on. */
export function documentDownloadPath(applicationId, documentId) {
  return `enrollment/applications/${applicationId}/documents/${documentId}/download/`;
}

/**
 * Fetch one enrollment document through its authorized endpoint.
 *
 * Neither an `<a href>` nor an `<iframe src>` can carry the Authorization
 * header, and the endpoint answers with `Content-Disposition: attachment`, so
 * the bytes are read here once and the caller decides what to do with them —
 * hand them to a blob URL for viewing, or to a download anchor.
 */
export async function fetchAuthorizedBlob(apiBase, path) {
  const headers = authHeader();
  const response = await fetch(`${apiBase}/${path}`, {
    headers: Object.keys(headers).length ? headers : undefined,
  });
  if (!response.ok) {
    throw new Error('The file could not be downloaded.');
  }
  return response.blob();
}

/** Download an authorized document. Guests (account-less applicants)
 * download with their guest credential. */
export async function downloadAuthorizedFile(apiBase, path, filename) {
  const blob = await fetchAuthorizedBlob(apiBase, path);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || 'document';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * What the browser can render on its own, keyed by the extension the upload
 * endpoint accepts (`.doc`/`.docx` are deliberately absent — inline Word
 * rendering needs a converter, so those keep the Download button).
 *
 * `mime` is used to re-stamp the blob: Django guesses the response type from
 * the filename, and when its guess table has no entry the blob arrives as
 * `application/octet-stream`, which an `<iframe>` refuses to render.
 */
const VIEWABLE_DOCUMENTS = {
  '.pdf': { kind: 'pdf', mime: 'application/pdf' },
  '.jpg': { kind: 'image', mime: 'image/jpeg' },
  '.jpeg': { kind: 'image', mime: 'image/jpeg' },
  '.png': { kind: 'image', mime: 'image/png' },
  '.webp': { kind: 'image', mime: 'image/webp' },
};

/** `{ kind, mime }` for a filename, or null when it cannot be previewed. */
export function viewableDocument(filename) {
  const extension = String(filename || '').toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  return (extension && VIEWABLE_DOCUMENTS[extension]) || null;
}

/** The upload endpoint's whitelist, mirrored here so a wrong file is named
 *  before the request runs instead of coming back as a 400. */
export const DOCUMENT_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx'];

export const DOCUMENT_FILE_ACCEPT = DOCUMENT_EXTENSIONS.join(',');

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Why this file cannot be uploaded, or null when it can. */
export function documentFileError(file) {
  const extension = String(file?.name || '').toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  if (!extension || !DOCUMENT_EXTENSIONS.includes(extension)) {
    return 'Use PDF, JPG, PNG, WEBP, DOC or DOCX.';
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `${file.name} is over the 10 MB limit.`;
  }
  return null;
}

