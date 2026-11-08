/**
 * Admin fee assessment editor.
 *
 * Two questions decide a bill — what is owed, and who owes it — so the form is split
 * along them instead of being six inputs in a column. The lifecycle (draft, published,
 * archived) and the note sit apart from both, and on an existing assessment the money
 * already collected is the first thing on the screen rather than a fact you have to
 * scroll past the form to find.
 *
 * Save and Archive are pinned under the scroll rather than at the end of it. A phone
 * keyboard pushes the page around, and a submit button that has moved twice is a button
 * you stop trusting. The four foreign keys come from the reference endpoints the web app
 * uses, never typed; validation is reported inline because `Alert.alert` is a no-op on
 * react-native-web, where a failed save used to look like a dead button.
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { colors, spacing, typography, type Tone } from '../../../../../theme';
import { api, ApiError } from '../../../../../api/client';
import type { FeeAssessmentDetail, FeeCategory, FeePayment, Section } from '../../../../../api/types';
import { formatDate, formatPeso, formatPesoExact } from '../../../../../format';
import { ErrorBanner, ErrorState, LoadingState } from '../../../../../components/StateViews';
import AppHeader from '../../../../../components/ui/AppHeader';
import Badge from '../../../../../components/ui/Badge';
import Button from '../../../../../components/ui/Button';
import Card from '../../../../../components/ui/Card';
import ConfirmRow from '../../../../../components/ui/ConfirmRow';
import Dropdown from '../../../../../components/ui/Dropdown';
import Field from '../../../../../components/ui/Field';
import ListRow from '../../../../../components/ui/ListRow';
import ProgressBar from '../../../../../components/ui/ProgressBar';
import Screen from '../../../../../components/ui/Screen';
import SectionHeader from '../../../../../components/ui/SectionHeader';
import SegmentedControl from '../../../../../components/ui/SegmentedControl';

type Status = 'draft' | 'published' | 'archived';

const STATUS_TONE: Record<Status, Tone> = {
  draft: 'amber',
  published: 'green',
  archived: 'gray',
};

const PAYMENT_TONE: Record<FeePayment['status'], Tone> = {
  completed: 'green',
  pending: 'amber',
  voided: 'gray',
  refunded: 'blue',
};

/** Draft state for every editable field, mirrored to and from the API payload. */
interface AssessmentForm {
  category: number | null;
  school_year: number | null;
  grade_level: number | null;
  section: number | null;
  student: number | null;
  amount: string;
  due_date: string;
  status: Status;
  description: string;
}

const EMPTY: AssessmentForm = {
  category: null,
  school_year: null,
  grade_level: null,
  section: null,
  student: null,
  amount: '',
  due_date: '',
  status: 'draft',
  description: '',
};

/** `0` assessed is not a denominator, and a progress bar has to answer for it. */
function rateOf(collected: number, assessed: number) {
  if (assessed <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((collected / assessed) * 100)));
}

export default function FeeAssessmentEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const assessmentId = parseInt(id!, 10);

  const [form, setForm] = useState<AssessmentForm>(EMPTY);
  const [record, setRecord] = useState<FeeAssessmentDetail | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  // Reference lists behind the four foreign-key selectors.
  const [categories, setCategories] = useState<FeeCategory[]>([]);
  const [schoolYears, setSchoolYears] = useState<{ id: number; label: string }[]>([]);
  const [gradeLevels, setGradeLevels] = useState<{ id: number; name: string }[]>([]);
  const [sections, setSections] = useState<Section[]>([]);

  const loadRefs = useCallback(async () => {
    const [cats, years, levels, secs] = await Promise.allSettled([
      api.list<FeeCategory>('/fee-categories/'),
      api.list<{ id: number; label: string }>('/school-years/'),
      api.list<{ id: number; name: string }>('/grade-levels/'),
      api.list<Section>('/sections/'),
    ]);
    if (cats.status === 'fulfilled') setCategories(cats.value);
    if (years.status === 'fulfilled') setSchoolYears(years.value);
    if (levels.status === 'fulfilled') setGradeLevels(levels.value);
    if (secs.status === 'fulfilled') setSections(secs.value);
  }, []);

  const load = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }
    try {
      const data = await api.get<FeeAssessmentDetail>(`/fee-assessments/${assessmentId}/`);
      setRecord(data);
      setForm({
        category: data.category,
        school_year: data.school_year,
        grade_level: data.grade_level ?? null,
        section: data.section ?? null,
        student: data.student ?? null,
        amount: String(data.amount),
        due_date: data.due_date,
        status: data.status,
        description: data.description ?? '',
      });
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the assessment.');
    } finally {
      setLoading(false);
    }
  }, [assessmentId, isNew]);

  useEffect(() => {
    // Mount fetches. Both helpers set state only after their awaits, which is what
    // the rule below is really guarding against.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRefs();
  }, [loadRefs]);

  useEffect(() => {
    // A new assessment has nothing to fetch, so `load` clears the spinner inline
    // for that one case; every other update lands after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const patch = (next: Partial<AssessmentForm>) => setForm((previous) => ({ ...previous, ...next }));

  const handleSave = async () => {
    if (!form.category || !form.school_year || !form.amount || !form.due_date) {
      setFormError('Category, school year, amount and due date are required.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.due_date)) {
      setFormError('Due date must look like 2026-06-30.');
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const payload = {
        category: Number(form.category),
        school_year: Number(form.school_year),
        grade_level: form.grade_level ? Number(form.grade_level) : undefined,
        section: form.section ? Number(form.section) : undefined,
        student: form.student ? Number(form.student) : undefined,
        amount: parseFloat(form.amount).toFixed(2),
        due_date: form.due_date,
        status: form.status,
        description: form.description || '',
      };
      if (isNew) {
        await api.post('/fee-assessments/', payload);
      } else {
        await api.patch(`/fee-assessments/${assessmentId}/`, payload);
      }
      router.back();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save the assessment.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Archiving is destructive and `Alert.alert` does nothing on react-native-web,
   * so the confirmation lives in the pinned footer rather than a dialog that never appears.
   */
  const handleArchive = async () => {
    setSaving(true);
    try {
      await api.patch(`/fee-assessments/${assessmentId}/`, { status: 'archived' });
      router.back();
    } catch (err) {
      setConfirmArchive(false);
      setFormError(err instanceof ApiError ? err.message : 'Could not archive the assessment.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading assessment…" />;
  if (error && !record) {
    return (
      <View style={styles.full}>
        <ErrorState message={error} onRetry={load} />
      </View>
    );
  }

  // A bill can stop at a year, a section or one student; the widest label that is
  // actually true is the one worth putting in the header.
  const scope = record
    ? record.student_name ||
      [record.grade_level_name, record.section_name].filter(Boolean).join(' · ') ||
      'Every student'
    : 'Every student';
  const payments = record?.payments ?? [];
  const collected = Number(record?.total_collected ?? 0);
  const assessed = Number(record?.total_assessed ?? 0);
  const outstanding = Number(record?.outstanding_balance ?? 0);

  return (
    <Screen
      animationKey={isNew ? 'new' : String(assessmentId)}
      header={
        <AppHeader
          title={isNew ? 'New Assessment' : record?.category_name || 'Assessment'}
          subtitle={isNew ? 'Build a bill for a category and a school year' : `${record?.category_code} · ${scope}`}
          back
        />
      }
    >
      <View style={styles.frame}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {formError ? <ErrorBanner message={formError} /> : null}

          {!isNew && record ? (
            <Card style={styles.money}>
              <View style={styles.moneyHead}>
                <View style={styles.moneyFigure}>
                  <Text style={styles.metric}>{formatPeso(outstanding)}</Text>
                  <Text style={styles.moneyNote}>
                    outstanding of {formatPeso(assessed)} assessed
                  </Text>
                </View>
                <Badge label={form.status} tone={STATUS_TONE[form.status]} glyph={false} />
              </View>
              <ProgressBar
                value={rateOf(collected, assessed)}
                tone={outstanding > 0 ? 'amber' : 'green'}
                thickness="thin"
                detail={`${formatPesoExact(collected)} collected`}
              />
              <Text style={styles.moneyFoot}>
                {record.student_count ?? 0} student{record.student_count === 1 ? '' : 's'} billed
                {record.due_date ? ` · due ${formatDate(record.due_date)}` : ''}
              </Text>
            </Card>
          ) : null}

          <View style={styles.section}>
            <SectionHeader title="What is owed" detail="The fee, the year it belongs to, the amount." />
            <Card style={styles.form}>
              <Dropdown<number>
                label="Category"
                options={categories.map((c) => ({ label: `${c.name} (${c.code})`, value: c.id }))}
                value={form.category}
                onChange={(v) => patch({ category: v })}
                placeholder="Choose a fee category"
              />
              <Dropdown<number>
                label="School year"
                options={schoolYears.map((y) => ({ label: y.label, value: y.id }))}
                value={form.school_year}
                onChange={(v) => patch({ school_year: v })}
                placeholder="Choose a school year"
              />
              <Field
                label="Amount (PHP)"
                value={form.amount}
                onChangeText={(v) => patch({ amount: v })}
                placeholder="5000.00"
                testID="fees-amount"
                trailing={<Text style={styles.unit}>PHP</Text>}
                inputProps={{ keyboardType: 'decimal-pad' }}
              />
              <Field
                label="Due date"
                value={form.due_date}
                onChangeText={(v) => patch({ due_date: v })}
                placeholder="2026-06-30"
                hint="The day the balance falls due, year first."
                testID="fees-due-date"
                inputProps={{ keyboardType: 'numbers-and-punctuation' }}
              />
            </Card>
          </View>

          <View style={styles.section}>
            <SectionHeader
              title="Who owes it"
              detail="Leave both empty to bill every student in the year."
            />
            <Card style={styles.form}>
              <Dropdown<number>
                label="Grade level"
                options={gradeLevels.map((g) => ({ label: g.name, value: g.id }))}
                value={form.grade_level}
                onChange={(v) => patch({ grade_level: v })}
                placeholder="All grade levels"
              />
              <Dropdown<number>
                label="Section"
                options={sections.map((s) => ({
                  label: s.grade_level_name ? `${s.name} — ${s.grade_level_name}` : s.name,
                  value: s.id,
                }))}
                value={form.section}
                onChange={(v) => patch({ section: v })}
                placeholder="Every section"
              />
            </Card>
          </View>

          <View style={styles.section}>
            <SectionHeader
              title="Status"
              detail="A draft never reaches a collection report until it is published."
            />
            <Card style={styles.form}>
              <SegmentedControl<Status>
                options={[
                  { label: 'Draft', value: 'draft' },
                  { label: 'Published', value: 'published' },
                  { label: 'Archived', value: 'archived' },
                ]}
                value={form.status}
                onChange={(v) => patch({ status: v })}
              />
              <Field
                label="Description"
                value={form.description}
                onChangeText={(v) => patch({ description: v })}
                placeholder="Optional note shown with the bill"
                multiline
                minLines={3}
              />
            </Card>
          </View>

          {payments.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader
                title="Receipts"
                count={payments.length}
                countNoun="payment"
                detail="Recorded against this assessment."
              />
              <Card padded={false}>
                {payments.map((p, i) => (
                  <ListRow
                    key={p.id}
                    divider={i < payments.length - 1}
                    avatar={p.student_name}
                    title={p.student_name}
                    subtitle={`${p.assessment_category} · ${formatDate(p.payment_date)}`}
                    detail={p.receipt_number}
                    trailing={
                      <View style={styles.receiptTrailing}>
                        <Text style={[styles.receiptAmount, p.status === 'voided' && styles.receiptVoided]}>
                          {formatPesoExact(p.amount)}
                        </Text>
                        <Badge label={p.status} tone={PAYMENT_TONE[p.status] ?? 'gray'} glyph={false} />
                      </View>
                    }
                  />
                ))}
              </Card>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {isNew ? (
            <Button
              variant="primary"
              block
              onPress={handleSave}
              disabled={saving}
              loading={saving}
              testID="fees-save"
            >
              Create assessment
            </Button>
          ) : confirmArchive ? (
            <ConfirmRow
              message="Archiving hides this assessment from new payments but keeps its history."
              confirmLabel="Archive now"
              onConfirm={handleArchive}
              onCancel={() => setConfirmArchive(false)}
              busy={saving}
            />
          ) : (
            <View style={styles.footerRow}>
              <Button
                variant="primary"
                onPress={handleSave}
                disabled={saving}
                loading={saving}
                style={styles.footerPrimary}
                testID="fees-save"
              >
                Save changes
              </Button>
              {form.status === 'published' ? (
                <Button
                  variant="danger"
                  onPress={() => {
                    setFormError(null);
                    setConfirmArchive(true);
                  }}
                  disabled={saving}
                >
                  Archive
                </Button>
              ) : null}
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, minHeight: 0 },
  full: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xl },
  section: { gap: spacing.md },
  form: { gap: spacing.md },
  /** The footer keeps the safe gutter the page uses, and a hairline above the action. */
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  footerRow: { flexDirection: 'row', gap: spacing.md },
  footerPrimary: { flex: 2 },
  money: { gap: spacing.md },
  moneyHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  moneyFigure: { flex: 1, gap: spacing.xxs },
  metric: { ...typography.metric, color: colors.navy },
  moneyNote: { ...typography.caption, color: colors.textSubtle },
  moneyFoot: { ...typography.subtle },
  unit: { ...typography.label, color: colors.textMuted },
  receiptTrailing: { alignItems: 'flex-end', gap: spacing.xs },
  receiptAmount: { ...typography.body, fontWeight: '700', color: colors.greenText },
  receiptVoided: { color: colors.textMuted, textDecorationLine: 'line-through' },
});
