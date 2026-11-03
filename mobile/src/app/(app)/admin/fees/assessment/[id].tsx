/**
 * Admin Fee Assessment Detail — View and edit a fee assessment.
 *
 * The four foreign keys are chosen from the reference endpoints the web app
 * uses (`/fee-categories/`, `/school-years/`, `/grade-levels/`, `/sections/`),
 * never typed: an administrator knows a fee category by its name, not by its
 * primary key. Validation is reported inline because `Alert.alert` is a no-op
 * on react-native-web, where a failed save used to look like a dead button.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, typography } from '../../../../../theme';
import { api, ApiError } from '../../../../../api/client';
import type { FeeAssessmentDetail, FeeCategory, FeePayment, Section } from '../../../../../api/types';
import { ErrorBanner, ErrorState, LoadingState } from '../../../../../components/StateViews';
import AppHeader from '../../../../../components/ui/AppHeader';
import Button from '../../../../../components/ui/Button';
import Badge from '../../../../../components/ui/Badge';
import ConfirmRow from '../../../../../components/ui/ConfirmRow';
import Dropdown from '../../../../../components/ui/Dropdown';
import SegmentedControl from '../../../../../components/ui/SegmentedControl';
import { formatDate, formatPeso } from '../../../../../format';

export default function FeeAssessmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const assessmentId = parseInt(id!, 10);
  const isNew = id === 'new';

  interface AssessmentFormState {
    id?: number;
    category?: number | string | null;
    school_year?: number | string | null;
    grade_level?: number | string | null;
    section?: number | string | null;
    student?: number | string | null;
    amount?: number | string;
    due_date?: string;
    status?: 'draft' | 'published' | 'archived';
    description?: string;
    payments?: FeePayment[];
    category_name?: string;
    category_code?: string;
    category_fee_type?: 'compulsory' | 'voluntary';
    school_year_label?: string;
    grade_level_name?: string | null;
    section_name?: string | null;
    student_name?: string | null;
    created_by?: number | null;
    created_by_name?: string | null;
    created_at?: string;
    updated_at?: string;
    total_assessed?: number;
    total_collected?: number;
    outstanding_balance?: number;
    student_count?: number;
  }
  
  const [assessment, setAssessment] = useState<AssessmentFormState>({
    category: undefined,
    school_year: undefined,
    grade_level: undefined,
    section: undefined,
    student: undefined,
    amount: '0',
    due_date: '',
    status: 'draft',
    description: '',
    payments: [],
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

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
      // Convert API response (numbers) to form state (strings)
      setAssessment({
        id: data.id,
        category: data.category,
        school_year: data.school_year,
        grade_level: data.grade_level,
        section: data.section,
        student: data.student,
        amount: String(data.amount),
        due_date: data.due_date,
        status: data.status,
        description: data.description,
        payments: data.payments,
        category_name: data.category_name,
        category_code: data.category_code,
        category_fee_type: data.category_fee_type,
        school_year_label: data.school_year_label,
        grade_level_name: data.grade_level_name,
        section_name: data.section_name,
        student_name: data.student_name,
        created_by: data.created_by,
        created_by_name: data.created_by_name,
        created_at: data.created_at,
        updated_at: data.updated_at,
        total_assessed: data.total_assessed,
        total_collected: data.total_collected,
        outstanding_balance: data.outstanding_balance,
        student_count: data.student_count,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load assessment.');
    } finally {
      setLoading(false);
    }
  }, [assessmentId, isNew]);

  useEffect(() => {
    // Mount fetch — `loadRefs` sets state only after its await; the rule reads
    // the call rather than the schedule.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRefs();
  }, [loadRefs]);

  useEffect(() => {
    // A new assessment has nothing to fetch, so `load` clears the spinner inline
    // for that one case; every other update lands after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const handleSave = async () => {
    if (!assessment.category || !assessment.school_year || !assessment.amount || !assessment.due_date) {
      setFormError('Category, school year, amount and due date are required.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(assessment.due_date)) {
      setFormError('Due date must look like 2026-06-30.');
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        category: Number(assessment.category),
        school_year: Number(assessment.school_year),
        grade_level: assessment.grade_level ? Number(assessment.grade_level) : undefined,
        section: assessment.section ? Number(assessment.section) : undefined,
        student: assessment.student ? Number(assessment.student) : undefined,
        amount: parseFloat(assessment.amount as any).toFixed(2),
        due_date: assessment.due_date,
        status: assessment.status,
        description: assessment.description || '',
      };
      if (isNew) {
        await api.post('/fee-assessments/', payload);
      } else {
        await api.patch(`/fee-assessments/${assessmentId}/`, payload);
      }
      router.back();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save assessment.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Archiving is destructive and `Alert.alert` does nothing on react-native-web,
   * so the confirmation lives in the page instead of a dialog that never appears.
   */
  const [confirmArchive, setConfirmArchive] = useState(false);

  const handleArchive = async () => {
    setConfirmArchive(false);
    setSaving(true);
    try {
      await api.patch(`/fee-assessments/${assessmentId}/`, { status: 'archived' });
      router.back();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not archive assessment.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading assessment…" />;
  if (error && !assessment.category) {
    return (
      <ErrorState message={error} onRetry={load} />
    );
  }

  return (
    <View style={styles.screen}>
      <AppHeader
        title={isNew ? 'New Fee Assessment' : assessment.category_name || 'Assessment'}
        subtitle={isNew ? undefined : `${assessment.category_code} · ${formatPeso(assessment.amount ?? 0)}`}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back to fees"
          hitSlop={8}
        >
          <Ionicons name="chevron-back-outline" size={24} color={colors.blue} />
        </TouchableOpacity>

        {formError ? <ErrorBanner message={formError} /> : null}

        <View style={styles.section}>
          <Dropdown<number>
            label="Category"
            options={categories.map((c) => ({ label: `${c.name} (${c.code})`, value: c.id }))}
            value={assessment.category == null ? null : Number(assessment.category)}
            onChange={(v) => setAssessment((prev) => ({ ...prev, category: v }))}
            placeholder="Choose a fee category"
          />
        </View>

        <View style={styles.section}>
          <Dropdown<number>
            label="School year"
            options={schoolYears.map((y) => ({ label: y.label, value: y.id }))}
            value={assessment.school_year == null ? null : Number(assessment.school_year)}
            onChange={(v) => setAssessment((prev) => ({ ...prev, school_year: v }))}
            placeholder="Choose a school year"
          />
        </View>

        <View style={styles.section}>
          <Dropdown<number>
            label="Grade level (optional)"
            options={gradeLevels.map((g) => ({ label: g.name, value: g.id }))}
            value={assessment.grade_level == null ? null : Number(assessment.grade_level)}
            onChange={(v) => setAssessment((prev) => ({ ...prev, grade_level: v }))}
            placeholder="All grade levels"
          />
        </View>

        <View style={styles.section}>
          <Dropdown<number>
            label="Section (optional)"
            options={sections.map((s) => ({
              label: s.grade_level_name ? `${s.name} — ${s.grade_level_name}` : s.name,
              value: s.id,
            }))}
            value={assessment.section == null ? null : Number(assessment.section)}
            onChange={(v) => setAssessment((prev) => ({ ...prev, section: v }))}
            placeholder="Every section"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Amount (PHP)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 5000.00"
            value={String(assessment.amount || '')}
            onChangeText={v => setAssessment({...assessment, amount: v})}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Due date</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            value={assessment.due_date}
            onChangeText={v => setAssessment({...assessment, due_date: v})}
            keyboardType="numbers-and-punctuation"
          />
          <Text style={styles.help}>The day the balance falls due, e.g. 2026-06-30.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Status</Text>
          <SegmentedControl<"draft" | "published" | "archived">
            options={[
              { label: 'Draft', value: 'draft' },
              { label: 'Published', value: 'published' },
              { label: 'Archived', value: 'archived' },
            ]}
            value={assessment.status as 'draft' | 'published' | 'archived'}
            onChange={v => setAssessment({...assessment, status: v})}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Optional description"
            value={assessment.description}
            onChangeText={v => setAssessment({...assessment, description: v})}
            multiline
            numberOfLines={4}
          />
        </View>

        {!isNew && assessment.payments && assessment.payments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.label}>Payments ({assessment.payments.length})</Text>
            <View style={styles.list}>
              {assessment.payments.map(p => (
                <View key={p.id} style={styles.listItem}>
                  <View style={styles.listItemLeft}>
                    <Text style={styles.listItemTitle}>{p.student_name}</Text>
                    <Text style={styles.listItemSubtitle}>
                      {formatDate(p.payment_date)} · {p.payment_method} · {p.receipt_number}
                    </Text>
                  </View>
                  <View style={styles.listItemRight}>
                    <Text style={styles.listItemAmount}>{formatPeso(p.amount)}</Text>
                    <Badge
                      label={p.status}
                      tone={p.status === 'completed' ? 'green' : 'amber'}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.actions}>
          {isNew ? (
            <Button variant="primary" onPress={handleSave} disabled={saving} loading={saving}>
              Create assessment
            </Button>
          ) : confirmArchive ? (
            <ConfirmRow
              style={styles.confirm}
              message="Archiving hides this assessment from new payments but keeps its history."
              confirmLabel="Archive now"
              onConfirm={handleArchive}
              onCancel={() => setConfirmArchive(false)}
              busy={saving}
            />
          ) : (
            <>
              <Button variant="primary" onPress={handleSave} disabled={saving} loading={saving}>
                Save changes
              </Button>
              {assessment.status === 'published' && (
                <Button
                  variant="danger"
                  onPress={() => setConfirmArchive(true)}
                  style={styles.deleteBtn}
                >
                  Archive
                </Button>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  section: { gap: spacing.sm },
  label: { ...typography.label },
  help: { ...typography.subtle },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.input,
  },
  textarea: { minHeight: 100, textAlignVertical: 'top' },
  list: { gap: spacing.sm },
  listItem: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  listItemLeft: { flex: 1 },
  listItemRight: { alignItems: 'flex-end', gap: spacing.xs },
  listItemTitle: { ...typography.body, fontWeight: '700', color: colors.text },
  listItemSubtitle: { ...typography.subtle, marginTop: 2 },
  listItemAmount: { ...typography.body, fontWeight: '700', color: colors.greenText },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  confirm: { flex: 1 },
  deleteBtn: { flex: 1 },
  backButton: { marginBottom: spacing.md, alignSelf: 'flex-start', minWidth: 44, minHeight: 44 },
});