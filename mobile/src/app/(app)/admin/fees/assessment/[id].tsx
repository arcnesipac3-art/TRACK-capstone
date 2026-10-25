/**
 * Admin Fee Assessment Detail — View and edit a fee assessment.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, typography } from '../../../../../theme';
import { api, ApiError } from '../../../../../api/client';
import type { FeeAssessment, FeeAssessmentDetail, FeeCategory, FeePayment } from '../../../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../../../components/StateViews';
import AppHeader from '../../../../../components/ui/AppHeader';
import Button from '../../../../../components/ui/Button';
import Badge from '../../../../../components/ui/Badge';
import SegmentedControl from '../../../../../components/ui/SegmentedControl';

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

  // Reference data
  const [categories, setCategories] = useState<FeeCategory[]>([]);

  const loadRefs = useCallback(async () => {
    try {
      const cats = await api.list<FeeCategory>('/fee-categories/');
      setCategories(cats);
      if (isNew) {
        // School year will be loaded from the API when creating
      }
    } catch (err) {
      console.error('Failed to load refs:', err);
    }
  }, [isNew]);

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
    loadRefs();
  }, [loadRefs]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!assessment.category || !assessment.school_year || !assessment.amount || !assessment.due_date) {
      Alert.alert('Error', 'Category, school year, amount, and due date are required.');
      return;
    }
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
      setError(err instanceof ApiError ? err.message : 'Could not save assessment.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    Alert.alert(
      'Archive Assessment',
      'Are you sure you want to archive this assessment? This will hide it from new payments but preserve history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.patch(`/fee-assessments/${assessmentId}/`, { status: 'archived' });
              router.back();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Could not archive assessment.');
            }
          },
        },
      ]
    );
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
        subtitle={isNew ? undefined : `${assessment.category_code} · ₱${Number(assessment.amount).toLocaleString()}`}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back-outline" size={24} color={colors.navy700} />
        </TouchableOpacity>

        <View style={styles.section}>
          <Text style={styles.label}>Category</Text>
          <TextInput
            style={styles.input}
            placeholder="Category ID"
            value={String(assessment.category || '')}
            onChangeText={v => setAssessment(prev => ({...prev, category: parseInt(v) || undefined}))}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>School Year</Text>
          <TextInput
            style={styles.input}
            placeholder="School Year ID"
            value={String(assessment.school_year || '')}
            onChangeText={v => setAssessment(prev => ({...prev, school_year: parseInt(v) || undefined}))}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Grade Level (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Grade Level ID"
            value={String(assessment.grade_level || '')}
            onChangeText={v => setAssessment(prev => ({...prev, grade_level: parseInt(v) || undefined}))}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Section (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Section ID"
            value={String(assessment.section || '')}
            onChangeText={v => setAssessment(prev => ({...prev, section: parseInt(v) || undefined}))}
            keyboardType="numeric"
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
          <Text style={styles.label}>Due Date</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            value={assessment.due_date}
            onChangeText={v => setAssessment({...assessment, due_date: v})}
          />
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
                      {new Date(p.payment_date).toLocaleDateString()} · {p.payment_method} · {p.receipt_number}
                    </Text>
                  </View>
                  <View style={styles.listItemRight}>
                    <Text style={styles.listItemAmount}>₱{p.amount.toLocaleString()}</Text>
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
              Create Assessment
            </Button>
          ) : (
            <>
              <Button variant="primary" onPress={handleSave} disabled={saving} loading={saving}>
                Save Changes
              </Button>
              {assessment.status === 'published' && (
                <Button variant="secondary" onPress={handleArchive} style={styles.deleteBtn}>
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
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.body,
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
  listItemTitle: { ...typography.body, fontWeight: '600', color: colors.text },
  listItemSubtitle: { ...typography.subtle, marginTop: 2 },
  listItemAmount: { ...typography.body, fontWeight: '600', color: colors.green700 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  deleteBtn: { flex: 1 },
  backButton: { marginBottom: spacing.md, alignSelf: 'flex-start' },
});