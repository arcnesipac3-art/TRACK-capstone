/**
 * Admin Fee Category Detail — View and edit a fee category.
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
import type { FeeCategory } from '../../../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../../../components/StateViews';
import AppHeader from '../../../../../components/ui/AppHeader';
import Button from '../../../../../components/ui/Button';
import Badge from '../../../../../components/ui/Badge';
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
    load();
  }, [load]);

  const handleSave = async () => {
    if (!category.name || !category.code) {
      Alert.alert('Error', 'Name and code are required.');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        await api.post('/fee-categories/', category);
      } else {
        await api.patch(`/fee-categories/${categoryId}/`, category);
      }
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save category.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    Alert.alert(
      'Delete Category',
      'Are you sure you want to delete this fee category? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/fee-categories/${categoryId}/`);
              router.back();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Could not delete category.');
            }
          },
        },
      ]
    );
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
        >
          <Ionicons name="chevron-back-outline" size={24} color={colors.navy700} />
        </TouchableOpacity>
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
            <Text style={styles.muted}>{category.assessment_count} assessment(s) using this category</Text>
          </View>
        )}

        <View style={styles.actions}>
          {isNew ? (
            <Button variant="primary" onPress={handleSave} disabled={saving} loading={saving}>
              Create Category
            </Button>
          ) : (
            <>
              <Button variant="primary" onPress={handleSave} disabled={saving} loading={saving}>
                Save Changes
              </Button>
              <Button variant="danger" onPress={handleDelete} style={styles.deleteBtn}>
                Delete Category
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
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.body,
  },
  textarea: { minHeight: 100, textAlignVertical: 'top' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  muted: { ...typography.subtle },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  deleteBtn: { flex: 1 },
  backButton: { marginBottom: spacing.md, alignSelf: 'flex-start' },
});