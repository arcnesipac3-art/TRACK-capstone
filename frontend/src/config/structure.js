/**
 * Metadata for the four record types on the School Structure screen.
 *
 * Kept out of `StructureFormModal.jsx` so that file only exports components
 * (which is what Vite Fast Refresh requires), and so the page and the form
 * share one source of truth for REST segments.
 *
 * `schoolYear`/`gradeLevel` map onto kebab-cased endpoints, so the plural is
 * stored rather than derived — `${kind}s/` would produce `/schoolYears/`.
 */
export const KINDS = {
  section: { endpoint: 'sections', noun: 'section', fields: 'structure' },
  subject: { endpoint: 'subjects', noun: 'subject', fields: 'structure' },
  schoolYear: { endpoint: 'school-years', noun: 'school year', fields: 'schoolYear' },
  gradeLevel: { endpoint: 'grade-levels', noun: 'grade level', fields: 'gradeLevel' },
}

/** REST segment for a kind, so `schoolYear` never becomes `/schoolYears/`. */
export function endpointFor(kind) {
  return (KINDS[kind] || KINDS.section).endpoint
}

/** Form field set each kind uses, so the modal can branch on one value. */
export function fieldsFor(kind) {
  return (KINDS[kind] || KINDS.section).fields
}

/** Button/title noun for a kind, e.g. "school year". */
export function nounFor(kind) {
  return (KINDS[kind] || KINDS.section).noun
}
