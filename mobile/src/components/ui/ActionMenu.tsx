/**
 * TRACK — contextual action menu.
 *
 * The three-dot menu the web app puts on every table row had no equivalent on the
 * phone: actions either became a permanent button on the face of a row (four
 * competing buttons per row, which is why the old lists read as toolbars) or they
 * were missing entirely.
 *
 * This is the third option: a row keeps one primary action on its face and the rest
 * live behind a long-press or a kebab, presented as a sheet of labelled destinations.
 * A destructive entry is red and last, because a thumb that overshot should not
 * delete an account.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';

import { colors, radius, spacing, tones, typography, type Tone } from '../../theme';
import { hapticImpact } from '../../haptics';
import Sheet from './Sheet';

type Glyph = ComponentProps<typeof Ionicons>['name'];

export type ActionItem = {
  key: string;
  label: string;
  /** One line: what will happen, not how. */
  detail?: string;
  icon?: Glyph;
  tone?: Tone;
  onSelect: () => void;
  /** Renders the row as disabled with its reason, rather than hiding it. */
  unavailable?: string;
};

type ActionMenuProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  actions: ActionItem[];
  /** Shown when there are no actions the role is allowed to take. */
  emptyLabel?: string;
  leading?: ReactNode;
};

export default function ActionMenu({
  visible,
  onClose,
  title,
  subtitle,
  actions,
  emptyLabel = 'No actions available for your account.',
  leading,
}: ActionMenuProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle} size="auto">
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      {actions.length === 0 ? (
        <Text style={styles.empty}>{emptyLabel}</Text>
      ) : (
        <View style={styles.list}>
          {actions.map((action, index) => {
            const disabled = Boolean(action.unavailable);
            const palette = action.tone === 'red' ? tones.red : null;
            return (
              <Pressable
                key={action.key}
                onPress={() => {
                  if (disabled) return;
                  hapticImpact('light');
                  // Close first: an action that navigates should not leave a sheet
                  // open behind it on the next screen.
                  onClose();
                  action.onSelect();
                }}
                disabled={disabled}
                style={({ pressed }) => [
                  styles.row,
                  index < actions.length - 1 && styles.divider,
                  pressed && styles.pressed,
                  disabled && styles.disabled,
                ]}
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                accessibilityLabel={action.unavailable ?? action.label}
                testID={`action-${action.key}`}
              >
                <View
                  style={[
                    styles.chip,
                    palette ? { backgroundColor: palette.background } : null,
                  ]}
                >
                  <Ionicons
                    name={action.icon ?? 'ellipse-outline'}
                    size={18}
                    color={palette ? palette.text : colors.navy}
                  />
                </View>
                <View style={styles.texts}>
                  <Text style={[styles.label, action.tone === 'red' ? styles.labelRed : null]}>
                    {action.label}
                  </Text>
                  {action.unavailable ? (
                    <Text style={styles.reason}>{action.unavailable}</Text>
                  ) : action.detail ? (
                    <Text style={styles.detail} numberOfLines={2}>
                      {action.detail}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  leading: { marginBottom: spacing.sm },
  list: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { backgroundColor: colors.blueWash },
  disabled: { opacity: 0.45 },
  chip: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.quietFill,
  },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  label: { ...typography.subhead },
  labelRed: { color: colors.redText },
  detail: { ...typography.subtle },
  reason: { ...typography.subtle, color: colors.textSubtle },
  empty: { ...typography.muted },
});
