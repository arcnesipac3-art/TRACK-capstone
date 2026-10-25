/**
 * Teacher review — requirements list with per-submission verification.
 *
 * Flow: pick one of your requirements → see the submissions students handed
 * in → leave feedback and set the status (Submitted / Verified / Returned).
 * Every write is a PATCH to /submissions/<id>/ with {status,
 * teacher_feedback}, exactly like the web SubmissionsPage; the backend stamps
 * verified_at, writes the history entry and notifies the student. Only rows
 * for this teacher's own requirements are ever listed (server-enforced).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import ScreenList from '../../../components/ScreenList';

import { colors, spacing, radius, typography, type Tone } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import type { Requirement, Submission, SubmissionStatus } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import AppHeader from '../../../components/ui/AppHeader';
import Badge from '../../../components/ui/Badge';

function formatDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusMeta(status: SubmissionStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'verified': return { label: 'Verified', tone: 'green' };
    case 'submitted': return { label: 'Awaiting verification', tone: 'amber' };
    case 'returned': return { label: 'Returned', tone: 'red' };
    case 'overdue': return { label: 'Overdue', tone: 'red' };
    default: return { label: 'Not submitted', tone: 'gray' };
  }
}

type RequirementRowData = Requirement & { pending: number; total: number };

export default function TeacherReviewScreen() {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [reqs, subs] = await Promise.all([
        api.list<Requirement>('/requirements/'),
        api.list<Submission>('/submissions/'),
      ]);
      setRequirements(reqs);
      setSubmissions(subs);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load submissions for review.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const rows = useMemo<RequirementRowData[]>(() => {
    return requirements
      .map((req) => {
        const forReq = submissions.filter((s) => s.requirement === req.id);
        return {
          ...req,
          total: forReq.length,
          pending: forReq.filter((s) => s.status === 'submitted').length,
        };
      })
      .sort((a, b) => {
        // Requirements with work waiting come first, then by deadline.
        if (b.pending !== a.pending) return b.pending - a.pending;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      });
  }, [requirements, submissions]);

  const submissionsFor = useCallback(
    (requirementId: number) =>
      submissions
        .filter((s) => s.requirement === requirementId)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [submissions]
  );

  const handleUpdated = useCallback((updated: Submission) => {
    setSubmissions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  if (loading) return <LoadingState label="Loading submissions…" />;
  if (error && requirements.length === 0) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  return (
    <View style={styles.screen}>
      <AppHeader title="Review" subtitle="Check submissions and give feedback." />
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.navy700]} />}
        contentContainerStyle={styles.content}
      >
        {error && <Text style={styles.errorText}>{error}</Text>}
        {rows.length === 0 ? (
          <EmptyState
            inline
            title="No requirements yet"
            body="Requirements you post for your classes will appear here for review."
          />
        ) : (
          <ScreenList
            data={rows}
            keyExtractor={(item) => String(item.id)}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={(item) => {
              const isOpen = expanded === item.id;
              const subs = isOpen ? submissionsFor(item.id) : [];
              return (
                <View style={styles.card}>
                  <TouchableOpacity
                    style={styles.cardHeader}
                    onPress={() => setExpanded(isOpen ? null : item.id)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                  >
                    <View style={styles.grow}>
                      <Text style={styles.subject}>{item.subject_name}</Text>
                      <Text style={styles.title}>{item.title}</Text>
                      <Text style={styles.meta}>
                        Due {formatDate(item.deadline)} · {item.section_name}
                      </Text>
                    </View>
                    <View style={styles.headerRight}>
                      {item.pending > 0 && (
                        <Badge label={`${item.pending} to check`} tone="amber" />
                      )}
                      <Text style={styles.count}>
                        {item.total} {item.total === 1 ? 'submission' : 'submissions'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {isOpen && (
                    <View style={styles.detail}>
                      {subs.length === 0 ? (
                        <Text style={styles.meta}>No one has submitted work for this requirement yet.</Text>
                      ) : (
                        subs.map((sub) => (
                          <SubmissionReview
                            key={sub.id}
                            submission={sub}
                            onUpdated={handleUpdated}
                          />
                        ))
                      )}
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* One submission with review controls                                 */
/* ------------------------------------------------------------------ */

const STATUS_CHOICES: { value: SubmissionStatus; label: string }[] = [
  { value: 'submitted', label: 'Awaiting' },
  { value: 'verified', label: 'Verified' },
  { value: 'returned', label: 'Returned' },
];

function SubmissionReview({
  submission,
  onUpdated,
}: {
  submission: Submission;
  onUpdated: (s: Submission) => void;
}) {
  const [feedback, setFeedback] = useState(submission.teacher_feedback ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const meta = statusMeta(submission.status);
  const dirty =
    feedback.trim() !== (submission.teacher_feedback ?? '') ||
    false; // status handled via explicit buttons

  const save = async (status?: SubmissionStatus) => {
    if (saving) return;
    const body: { status?: SubmissionStatus; teacher_feedback: string } = {
      teacher_feedback: feedback.trim(),
    };
    if (status) body.status = status;

    setSaving(true);
    setRowError(null);
    setMessage(null);
    try {
      const updated = await api.patch<Submission>(`/submissions/${submission.id}/`, body);
      onUpdated(updated);
      setMessage(
        status === 'verified'
          ? 'Marked verified — the student has been notified.'
          : status === 'returned'
            ? 'Returned for revision — the student has been notified.'
            : 'Feedback saved.'
      );
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Could not save your review.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.subCard}>
      <View style={styles.subTop}>
        <View style={styles.grow}>
          <Text style={styles.subName}>{submission.student_name}</Text>
          <Text style={styles.meta}>
            {submission.submitted_at ? `Submitted ${formatDate(submission.submitted_at)}` : 'Not submitted'}
            {submission.verified_at ? ` · Verified ${formatDate(submission.verified_at)}` : ''}
          </Text>
        </View>
        <Badge label={meta.label} tone={meta.tone} />
      </View>

      {submission.link_url ? (
        <Text style={styles.link} numberOfLines={2}>{submission.link_url}</Text>
      ) : null}

      <TextInput
        style={styles.feedbackInput}
        value={feedback}
        onChangeText={(v) => { setFeedback(v); setMessage(null); }}
        placeholder="Feedback for the student (optional)"
        placeholderTextColor={colors.textSubtle}
        multiline
        textAlignVertical="top"
        editable={!saving}
        accessibilityLabel={`Feedback for ${submission.student_name}`}
      />

      <View style={styles.actions}>
        {STATUS_CHOICES.map((choice) => {
          const active = submission.status === choice.value;
          return (
            <TouchableOpacity
              key={choice.value}
              style={[
                styles.statusButton,
                active && styles.statusButtonActive,
                choice.value === 'verified' && !active && styles.statusVerify,
                choice.value === 'returned' && !active && styles.statusReturn,
              ]}
              onPress={() => save(choice.value)}
              disabled={saving}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Set ${submission.student_name} to ${choice.label}`}
            >
              <Text
                style={[
                  styles.statusLabel,
                  active && styles.statusLabelActive,
                  !active && choice.value === 'verified' && { color: colors.green700 },
                  !active && choice.value === 'returned' && { color: colors.amber700 },
                ]}
              >
                {choice.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[styles.saveButton, (!dirty || saving) && { opacity: 0.5 }]}
          onPress={() => save()}
          disabled={saving || !dirty}
          activeOpacity={0.8}
        >
          <Text style={styles.saveLabel}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.helperCaption}>
        Status buttons apply immediately — use Save after editing feedback.
      </Text>

      {rowError && <Text style={styles.rowError}>{rowError}</Text>}
      {!rowError && message && <Text style={styles.rowOk}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  errorText: { ...typography.muted, color: colors.red700 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md },
  grow: { flex: 1, minWidth: 0 },
  subject: { ...typography.label, color: colors.navy700 },
  title: { ...typography.heading, color: colors.text, marginTop: 2 },
  meta: { ...typography.muted, marginTop: 2 },
  headerRight: { alignItems: 'flex-end', gap: spacing.xs },
  count: { ...typography.subtle },
  detail: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
  },
  subCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  subTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  subName: { ...typography.heading, color: colors.navy900 },
  link: { ...typography.subtle, color: colors.blue700 },
  feedbackInput: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 15,
    color: colors.text,
    minHeight: 64,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  statusButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statusButtonActive: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  statusVerify: { borderColor: colors.green700 },
  statusReturn: { borderColor: colors.amber700 },
  statusLabel: { ...typography.label, color: colors.textMuted },
  statusLabelActive: { color: colors.onNavy },
  saveButton: {
    marginLeft: 'auto',
    backgroundColor: colors.navy700,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  saveLabel: { ...typography.buttonText, color: colors.onNavy, fontSize: 14 },
  helperCaption: { ...typography.subtle, textAlign: 'center' },
  rowError: { ...typography.muted, color: colors.red700 },
  rowOk: { ...typography.muted, color: colors.green700 },
  separator: { height: 1 },
});
