/**
 * Admin Fee Category Detail — View and edit a fee category.
 *
 * Validation and the destructive delete are reported in-page: `Alert.alert` is
 * a no-op on react-native-web, so on a browser build the old dialog made
 * "Save" and "Delete" look dead rather than refusing the input.
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
import { countNoun } from '../../../../../format';
import { api, ApiError } from '../../../../../api/client';
import type { FeeCategory } from '../../../../../api/types';
import { ErrorBanner, ErrorState, LoadingState } from '../../../../../components/StateViews';
import AppHeader from '../../../../../components/ui/AppHeader';
import Button from '../../../../../components/ui/Button';
import Badge from '../../../../../components/ui/Badge';
import ConfirmRow from '../../../../../components/ui/ConfirmRow';
import SegmentedControl from '../../../../../components/ui/SegmentedControl';

export default function FeeCategoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const categoryId = parseInt(id!, 10);
  const isNew = id === 'new';

  const [category, setCategory] = useState<Partial<FeeCategory>>({
    name: '',
    code: '',
    fee_type: 'compulsory',
    description: '',
    is_active: true,
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }
    try {
      const data = await api.get<FeeCategory>(`/fee-categories/${categoryId}/`);
      setCategory(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load category.');
    } finally {
      setLoading(false);
    }
  }, [categoryId, isNew]);

  useEffect(() => {
    // A new category has nothing to fetch, so `load` clears the spinner inline
    // for that one case; every other update lands after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const handleSave = async () => {
    if (!category.name || !category.code) {
      setFormError('Name and code are required.');
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      if (isNew) {
        await api.post('/fee-categories/', category);
      } else {
        await api.patch(`/fee-categories/${categoryId}/`, category);
      }
      router.back();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save category.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    setSaving(true);
    try {
      await api.delete(`/fee-categories/${categoryId}/`);
      router.back();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not delete category.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading category…" />;
  if (error && !category.name) {
    return (
      <ErrorState message={error} onRetry={load} />
    );
  }

  return (
    <View style={styles.screen}>
      <AppHeader
        title={isNew ? 'New Fee Category' : category.name || ''}
        subtitle={isNew ? undefined : category.code || ''}
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
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Tuition Fee"
            value={category.name}
            onChangeText={v => setCategory({...category, name: v})}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Code</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. TUITION"
            value={category.code}
            onChangeText={v => setCategory({...category, code: v.toUpperCase()})}
            autoCapitalize="characters"
            maxLength={20}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Type</Text>
          <SegmentedControl
            options={[
              { label: 'Compulsory', value: 'compulsory' },
              { label: 'Voluntary', value: 'voluntary' },
            ]}
            value={category.fee_type as 'compulsory' | 'voluntary'}
            onChange={v => setCategory({...category, fee_type: v})}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Optional description"
            value={category.description}
            onChangeText={v => setCategory({...category, description: v})}
            multiline
            numberOfLines={4}
          />
        </View>

        {!isNew && (
          <View style={styles.section}>
            <Text style={styles.label}>Status</Text>
            <View style={styles.statusRow}>
              <Badge
                label={category.is_active ? 'Active' : 'Inactive'}
                tone={category.is_active ? 'green' : 'gray'}
              />
              <Button
                variant="secondary"
                size="sm"
                onPress={() => setCategory({...category, is_active: !category.is_active})}
              >
                {category.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            </View>
          </View>
        )}

        {!isNew && (
          <View style={styles.section}>
            <Text style={styles.label}>Assessments</Text>
            <Text style={styles.muted}>{countNoun(category.assessment_count ?? 0, 'assessment')} using this category</Text>
          </View>
        )}

        <View style={styles.actions}>
          {isNew ? (
            <Button variant="primary" onPress={handleSave} disabled={saving} loading={saving}>
              Create category
            </Button>
          ) : confirmDelete ? (
            <ConfirmRow
              style={styles.confirm}
              message={`Deleting removes this category for good. ${countNoun(category.assessment_count ?? 0, 'assessment')} use it.`}
              confirmLabel="Delete now"
              onConfirm={handleDelete}
              onCancel={() => setConfirmDelete(false)}
              busy={saving}
            />
          ) : (
            <>
              <Button variant="primary" onPress={handleSave} disabled={saving} loading={saving}>
                Save changes
              </Button>
              <Button variant="danger" onPress={() => setConfirmDelete(true)} style={styles.deleteBtn}>
                Delete category
              </Button>
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
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.input,
  },
  textarea: { minHeight: 100, textAlignVertical: 'top' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  muted: { ...typography.subtle },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  confirm: { flex: 1 },
  deleteBtn: { flex: 1 },
  backButton: { marginBottom: spacing.md, alignSelf: 'flex-start', minWidth: 44, minHeight: 44 },
});