/**
 * TRACK — status label and tone, in one place.
 *
 * Four screens hand-rolled the same submission-status switch and two rolled the
 * attendance one, and the copies had drifted: `submitted` was amber on the
 * teacher's queue and blue on the student's, `returned` was 'Returned' in one and
 * 'Returned for revision' in the others. The tone difference was deliberate —
 * `submitted` is work for whoever reviews it and a wait for whoever filed it — so
 * it is kept here as a named perspective instead of as a per-screen accident.
 */
import type { Tone } from './theme';

export type StatusPerspective = 'owner' | 'reviewer';

export type StatusMeta = { label: string; tone: Tone };

/**
 * A submission's state, as a badge label and the tone that colours it.
 *
 * `isOverdue` is the fallback the API gives when a row has no submission at all
 * and its deadline has passed: that reads as Overdue, not as Not submitted.
 */
export function submissionStatusMeta(
  status: string,
  isOverdue = false,
  perspective: StatusPerspective = 'owner'
): StatusMeta {
  switch (status) {
    case 'verified':
      return { label: 'Verified', tone: 'green' };
    case 'submitted':
      return { label: 'Awaiting verification', tone: perspective === 'reviewer' ? 'amber' : 'blue' };
    case 'returned':
      return { label: 'Returned for revision', tone: 'red' };
    case 'overdue':
      return { label: 'Overdue', tone: 'red' };
    default:
      return isOverdue
        ? { label: 'Overdue', tone: 'red' }
        : { label: 'Not submitted', tone: 'gray' };
  }
}

/** One roll-call mark, as a label and its tone. */
export function attendanceStatusMeta(status: string): StatusMeta {
  switch (status) {
    case 'present':
      return { label: 'Present', tone: 'green' };
    case 'absent':
      return { label: 'Absent', tone: 'red' };
    case 'late':
      return { label: 'Late', tone: 'amber' };
    default:
      return { label: 'Excused', tone: 'gray' };
  }
}
