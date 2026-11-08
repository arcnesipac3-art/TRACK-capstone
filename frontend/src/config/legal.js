/**
 * The version of the policies a visitor is asked to accept.
 *
 * Recorded with consent (EnrollmentApplication.consent_policy_version), so a
 * dispute about an application can be settled by showing which text that
 * person actually agreed to. Bump both values together when the policy pages
 * change materially; old values stay in the database as history, so a version
 * is never reused.
 */
export const POLICY_VERSION = '2026.11'
export const POLICY_UPDATED = 'November 2026'
