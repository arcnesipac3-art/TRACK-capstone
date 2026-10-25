/**
 * Student requirements list — mirrors the web RequirementsExplorer.
 *
 * Statuses come from the submissions endpoint joined client-side
 * (not submitted / submitted — awaiting verification / verified / returned /
 * overdue), exactly like the web app. "Submit work" opens a real form that
 * POSTs `{requirement, link_url, status:'submitted'}` — the same link-based
 * method the web app uses; the server stamps the student and timestamp, so a
 * student can never mark their own work verified or hand in for a classmate.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import ScreenList from '../../../components/ScreenList';

import { colors, spacing, radius, typography, scrim, type Tone } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import type { Requirement, Submission } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import AppHeader from '../../../components/ui/AppHeader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';

type Row = Requirement & {
  status: Submission['status'];
  submission?: Submission;
  overdueDays: number;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelative(iso: string | null) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 864e5);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(iso);
}

function statusMeta(status: Row['status'], isOverdue: boolean): { label: string; tone: Tone } {
  switch (status) {
    case 'verified': return { label: 'Verified', tone: 'green' };
    case 'submitted': return { label: 'Awaiting verification', tone: 'blue' };
    case 'returned': return { label: 'Returned for revision', tone: 'red' };
    case 'overdue': return { label: 'Overdue', tone: 'red' };
    default: return isOverdue
      ? { label: 'Overdue', tone: 'red' }
      : { label: 'Not submitted', tone: 'gray' };
  }
}

function requirementTypeLabel(t: string) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function StudentRequirementsScreen() {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Submission modal state
  const [submitFor, setSubmitFor] = useState<Row | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [reqs, subs] = await Promise.all([
        api.list<Requirement>('/requirements/'),
        api.list<Submission>('/submissions/'),
      ]);
      setRequirements(reqs);
      setSubmissions(subs);
      setLoadedAt(Date.now());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your requirements.');
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

  const rows = useMemo<Row[]>(() => {
    const now = loadedAt || 0;
    const subByReq = new Map(submissions.map((s) => [s.requirement, s]));
    return requirements
      .map((req) => {
        const sub = subByReq.get(req.id);
        let status: Row['status'] = 'not_submitted';
        if (sub) status = sub.status;
        else if (req.is_overdue) status = 'overdue';
        const overdueDays = req.is_overdue
          ? Math.floor((now - new Date(req.deadline).getTime()) / 864e5)
          : 0;
        return { ...req, status, submission: sub, overdueDays };
      })
      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  }, [requirements, submissions, loadedAt]);

  const handleSubmitDone = useCallback(async () => {
    setSubmitFor(null);
    setFlash('Work submitted — your teacher will review it.');
    await load();
  }, [load]);

  if (loading) return <LoadingState label="Loading requirements…" />;
  if (error && requirements.length === 0) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  return (
    <View style={styles.screen}>
      <AppHeader title="Requirements" subtitle="What you need to submit and when." />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.navy700]} />}
        contentContainerStyle={styles.content}
      >
        {error && <Text style={styles.errorText}>{error}</Text>}
        {flash && (
          <View style={styles.flash}>
            <Text style={styles.flashText}>{flash}</Text>
          </View>
        )}

        {rows.length === 0 ? (
          <EmptyState
            inline
            title="No requirements"
            body="When teachers post work for your section, it will appear here."
          />
        ) : (
          <ScreenList
            data={rows}
            keyExtractor={(item) => String(item.id)}
            renderItem={(item) => (
              <RequirementRow item={item} onSubmitPress={() => setSubmitFor(item)} />
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}

        <SubmitModal
          row={submitFor}
          onClose={() => setSubmitFor(null)}
          onSubmitted={handleSubmitDone}
        />
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Row                                                                 */
/* ------------------------------------------------------------------ */

function RequirementRow({ item, onSubmitPress }: { item: Row; onSubmitPress: () => void }) {
  const meta = statusMeta(item.status, item.is_overdue);
  const canSubmit =
    item.status === 'returned' || item.status === 'overdue' || item.status === 'not_submitted';

  return (
    <View style={styles.card}>
      <View style={styles.rowTop}>
        <View style={styles.grow}>
          <Text style={styles.subject}>{item.subject_name}</Text>
          <Text style={styles.title}>{item.title}</Text>
        </View>
        <Badge label={meta.label} tone={meta.tone} />
      </View>

      <View style={styles.meta}>
        <Text style={styles.metaItem}>
          <Text style={styles.metaBold}>{requirementTypeLabel(item.requirement_type)}</Text>
        </Text>
        <Text style={styles.metaItem}>
          Due {formatDate(item.deadline)}
          {item.is_overdue && (
            <Text style={{ color: colors.red700, fontWeight: '600' }}> · Overdue by {item.overdueDays} days</Text>
          )}
        </Text>
        <Text style={styles.metaItem}>{item.section_name}</Text>
      </View>

      {item.submission?.submitted_at && (
        <Text style={styles.submittedLine}>Submitted {formatRelative(item.submission.submitted_at)}</Text>
      )}

      {item.submission?.teacher_feedback ? (
        <Text style={styles.feedback} numberOfLines={3}>
          Feedback: {item.submission.teacher_feedback}
        </Text>
      ) : null}

      {canSubmit && (
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onSubmitPress}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`${item.status === 'returned' ? 'Resubmit' : 'Submit'} work for ${item.title}`}
        >
          <Text style={styles.actionText}>
            {item.status === 'returned' ? 'Resubmit work' : 'Submit work'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Submit modal                                                        */
/* ------------------------------------------------------------------ */

function SubmitModal({
  row,
  onClose,
  onSubmitted,
}: {
  row: Row | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  return (
    <Modal visible={row !== null} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalCard}>
          {/* Keyed by requirement id: opening a different requirement remounts
              the form, so its state resets without a setState-in-effect. */}
          {row ? (
            <SubmitForm key={row.id} row={row} onClose={onClose} onSubmitted={onSubmitted} />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SubmitForm({
  row,
  onClose,
  onSubmitted,
}: {
  row: Row;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [link, setLink] = useState(row.submission?.link_url ?? '');
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const handleSubmit = async () => {
    if (posting) return;
    const value = link.trim();
    if (!value) {
      setError('Paste a link to your work before submitting.');
      return;
    }
    if (!/^https?:\/\//i.test(value)) {
      setError('The link must start with http:// or https://');
      return;
    }
    setPosting(true);
    setError(null);
    try {
      // Same contract as the web app. The server stamps the student and
      // hand-in time, and a repeat POST refreshes the existing row instead of
      // creating a duplicate.
      await api.post('/submissions/', {
        requirement: row.id,
        link_url: value,
        status: 'submitted',
      });
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your work.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <>
      <Text style={styles.modalTitle}>
        {row.status === 'returned' ? 'Resubmit work' : 'Submit work'}
      </Text>
      <Text style={styles.modalSubject}>{row.subject_name}</Text>
      <Text style={styles.modalRequirement}>{row.title}</Text>
      <Text style={styles.modalHint}>
        Paste a link to your work (Google Drive, Docs, or any public URL).
      </Text>

      <TextInput
        style={styles.linkInput}
        value={link}
        onChangeText={(v) => { setLink(v); setError(null); }}
        placeholder="https://…"
        placeholderTextColor={colors.textSubtle}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
        editable={!posting}
        accessibilityLabel="Link to your work"
      />

      {error && <Text style={styles.modalError}>{error}</Text>}

      <View style={styles.modalActions}>
        <Button variant="secondary" block onPress={onClose} disabled={posting}>
          Cancel
        </Button>
        <Button variant="primary" block loading={posting} onPress={handleSubmit}>
          Submit
        </Button>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  errorText: { ...typography.muted, color: colors.red700 },
  flash: {
    backgroundColor: colors.green100,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  flashText: { ...typography.body, color: colors.green700 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  grow: { flex: 1, minWidth: 0 },
  subject: { ...typography.label, color: colors.navy700 },
  title: { ...typography.heading, color: colors.text, marginTop: 2 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  metaItem: { ...typography.muted },
  metaBold: { fontWeight: '600' },
  submittedLine: { ...typography.subtle, color: colors.blue700 },
  feedback: {
    fontSize: 15,
    color: colors.textMuted,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  actionButton: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  actionText: { ...typography.label, color: colors.navy700 },
  separator: { height: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: scrim,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.xs,
    paddingBottom: spacing.xxl,
  },
  modalTitle: { ...typography.title, color: colors.navy900 },
  modalSubject: { ...typography.label, color: colors.navy700, marginTop: spacing.sm },
  modalRequirement: { ...typography.heading, color: colors.text },
  modalHint: { ...typography.muted, marginTop: spacing.sm },
  linkInput: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
    marginTop: spacing.sm,
  },
  modalError: { ...typography.muted, color: colors.red700, marginTop: spacing.sm },
  modalActions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
