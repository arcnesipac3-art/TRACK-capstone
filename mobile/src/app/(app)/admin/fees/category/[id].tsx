/**
 * Admin fee category editor.
 *
 * A category is three facts — a name, a code and whether students have to pay it — and
 * the code is the one that outlives the name, because it is what lands on the receipt.
 * It gets its own hint line for that reason, and the compulsory/voluntary choice gets a
 * sentence explaining what the distinction is worth, rather than two labels an
 * administrator has to guess between.
 *
 * Save and Delete are pinned under the scroll so they never travel with the keyboard.
 * Validation and the destructive delete are reported in-page: `Alert.alert` is a no-op on
 * react-native-web, so on a browser build the old dialog made "Save" and "Delete" look
 * dead rather than refusing the input.
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { colors, spacing } from '../../../../../theme';
import { countNoun } from '../../../../../format';
import { api, ApiError } from '../../../../../api/client';
import type { FeeCategory } from '../../../../../api/types';
import { ErrorBanner, ErrorState, LoadingState } from '../../../../../components/StateViews';
import AppHeader from '../../../../../components/ui/AppHeader';
import Badge from '../../../../../components/ui/Badge';
import Button from '../../../../../components/ui/Button';
import Card from '../../../../../components/ui/Card';
import ConfirmRow from '../../../../../components/ui/ConfirmRow';
import Field from '../../../../../components/ui/Field';
import MetricsCard from '../../../../../components/ui/MetricsCard';
import Screen from '../../../../../components/ui/Screen';
import SectionHeader from '../../../../../components/ui/SectionHeader';
import SegmentedControl from '../../../../../components/ui/SegmentedControl';

type FeeType = 'compulsory' | 'voluntary';

/** Draft state. `is_active` is only ever edited on an existing category. */
interface CategoryForm {
  name: string;
  code: string;
  fee_type: FeeType;
  description: string;
  is_active: boolean;
}

const EMPTY: CategoryForm = {
  name: '',
  code: '',
  fee_type: 'compulsory',
  description: '',
  is_active: true,
};

export default function FeeCategoryEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const categoryId = parseInt(id!, 10);

  const [form, setForm] = useState<CategoryForm>(EMPTY);
  const [record, setRecord] = useState<FeeCategory | null>(null);
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
      setRecord(data);
      setForm({
        name: data.name,
        code: data.code,
        fee_type: data.fee_type,
        description: data.description ?? '',
        is_active: data.is_active,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the category.');
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

  const patch = (next: Partial<CategoryForm>) => setForm((previous) => ({ ...previous, ...next }));

  const handleSave = async () => {
    if (!form.name || !form.code) {
      setFormError('Name and code are required.');
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      if (isNew) {
        await api.post('/fee-categories/', form);
      } else {
        await api.patch(`/fee-categories/${categoryId}/`, form);
      }
      router.back();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save the category.');
    } finally {
      setSaving(false);
    }
  };

  /** The same in-page reason as the assessment editor: a refused delete has to say so. */
  const handleDelete = async () => {
    setSaving(true);
    try {
      await api.delete(`/fee-categories/${categoryId}/`);
      router.back();
    } catch (err) {
      setConfirmDelete(false);
      setFormError(err instanceof ApiError ? err.message : 'Could not delete the category.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading category…" />;
  if (error && !record) {
    return (
      <View style={styles.full}>
        <ErrorState message={error} onRetry={load} />
      </View>
    );
  }

  const usage = record?.assessment_count ?? 0;

  return (
    <Screen
      animationKey={isNew ? 'new' : String(categoryId)}
      header={
        <AppHeader
          title={isNew ? 'New Category' : record?.name || 'Category'}
          subtitle={
            isNew
              ? 'A fee the school can assess against students'
              : `${record?.code} · ${record?.fee_type}`
          }
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
            <MetricsCard
              columns={2}
              lead
              items={[
                {
                  key: 'usage',
                  label: 'IN USE',
                  value: String(usage),
                  tone: usage > 0 ? 'navy' : 'gray',
                  // The figure already carries the number, so the sub-line is the noun alone.
                  detail: usage === 1 ? 'assessment' : 'assessments',
                },
                {
                  key: 'status',
                  label: 'STATE',
                  value: form.is_active ? 'Active' : 'Retired',
                  tone: form.is_active ? 'green' : 'gray',
                  detail: form.is_active ? 'appears on new bills' : 'hidden from new bills',
                },
              ]}
              footnote="Retiring a category keeps its history; it simply stops being offered."
            />
          ) : null}

          <View style={styles.section}>
            <SectionHeader title="Identity" detail="The code is what prints on the receipt." />
            <Card style={styles.form}>
              <Field
                label="Name"
                value={form.name}
                onChangeText={(v) => patch({ name: v })}
                placeholder="Tuition Fee"
                testID="fees-category-name"
                inputProps={{ autoCapitalize: 'words' }}
              />
              <Field
                label="Code"
                value={form.code}
                onChangeText={(v) => patch({ code: v.toUpperCase() })}
                placeholder="TUITION"
                hint="Short, uppercase, and hard to change later."
                testID="fees-category-code"
                inputProps={{ autoCapitalize: 'characters', maxLength: 20 }}
              />
            </Card>
          </View>

          <View style={styles.section}>
            <SectionHeader
              title="Obligation"
              detail="Compulsory is expected of every student in scope; voluntary is not."
            />
            <Card style={styles.form}>
              <SegmentedControl<FeeType>
                options={[
                  { label: 'Compulsory', value: 'compulsory' },
                  { label: 'Voluntary', value: 'voluntary' },
                ]}
                value={form.fee_type}
                onChange={(v) => patch({ fee_type: v })}
              />
              <Field
                label="Description"
                value={form.description}
                onChangeText={(v) => patch({ description: v })}
                placeholder="Optional note shown with the fee"
                multiline
                minLines={3}
              />
            </Card>
          </View>

          {!isNew ? (
            <View style={styles.section}>
              <SectionHeader
                title="Availability"
                detail={
                  usage > 0
                    ? `Retiring leaves ${countNoun(usage, 'assessment')} intact.`
                    : 'Nothing is assessed against it yet.'
                  }
              />
              <Card style={styles.statusCard}>
                <View style={styles.statusRow}>
                  <Badge
                    label={form.is_active ? 'Active' : 'Retired'}
                    tone={form.is_active ? 'green' : 'gray'}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => patch({ is_active: !form.is_active })}
                    accessibilityLabel={form.is_active ? 'Retire this category' : 'Activate this category'}
                  >
                    {form.is_active ? 'Retire' : 'Activate'}
                  </Button>
                </View>
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
              Create category
            </Button>
          ) : confirmDelete ? (
            <ConfirmRow
              message={`Deleting removes this category for good. ${countNoun(usage, 'assessment')} use it.`}
              confirmLabel="Delete now"
              onConfirm={handleDelete}
              onCancel={() => setConfirmDelete(false)}
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
              <Button
                variant="danger"
                onPress={() => {
                  setFormError(null);
                  setConfirmDelete(true);
                }}
                disabled={saving}
              >
                Delete
              </Button>
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
  statusCard: { gap: spacing.sm },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  /** Same pinned footer as the assessment editor: the action does not scroll away. */
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
});
