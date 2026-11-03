/**
 * TRACK — the inline replacement for a confirm dialog.
 *
 * `Alert.alert` renders nothing on web (react-native-web stubs it), so every
 * "Are you sure?" in the admin editors silently swallowed its own button press:
 * the row looked tappable and then did nothing. An armed confirm keeps the
 * question in the layout — the destructive button arms the strip, Cancel or a
 * successful action disarms it — so the same two taps work on every platform.
 */
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme';
import Button from './Button';

type ConfirmRowProps = {
  /** What is about to happen, in the caller's words. */
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Keeps both buttons quiet while the write is in flight. */
  busy?: boolean;
  /** `danger` for an irreversible or blocking action, `primary` for a rescue. */
  tone?: 'danger' | 'primary';
  /** Where an actions row gives the question back its full width. */
  style?: StyleProp<ViewStyle>;
};

export default function ConfirmRow({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  tone = 'danger',
  style,
}: ConfirmRowProps) {
  return (
    <View
      style={[styles.row, tone === 'danger' ? styles.danger : styles.primary, style]}
      accessibilityRole="alert"
    >
      <Text style={[styles.message, tone === 'danger' ? styles.dangerText : styles.primaryText]}>
        {message}
      </Text>
      <View style={styles.buttons}>
        <Button variant="secondary" size="sm" onPress={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant={tone === 'danger' ? 'danger' : 'primary'}
          size="sm"
          onPress={onConfirm}
          disabled={busy}
          loading={busy}
        >
          {confirmLabel}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  danger: {
    backgroundColor: colors.redTint,
    borderColor: colors.border,
  },
  primary: {
    backgroundColor: colors.blueTint,
    borderColor: colors.border,
  },
  message: { ...typography.subtle },
  dangerText: { color: colors.redText },
  primaryText: { color: colors.blueText },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
});
