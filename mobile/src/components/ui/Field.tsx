/**
 * TRACK — labelled input.
 *
 * Nine fields in the account editor, four in each fee editor, four in the profile,
 * and every screen had restyled `TextInput` by itself — three different heights, two
 * border colours, and error text that appeared in a different place on each one.
 *
 * A field is a label, a control, and one line of consequence beneath it, in that
 * order, always. The consequence line keeps its slot whether or not there is
 * something to say: a form whose rows jump when validation fires is a form you
 * cannot type in.
 */
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { StyleProp, TextInputProps, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, touch, typography } from '../../theme';

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  /** Shown under the input. With `error`, both the line and the border go red. */
  hint?: string;
  error?: string;
  placeholder?: string;
  secureEntry?: boolean;
  multiline?: boolean;
  /** Line count for a multiline field; the box grows with it. */
  minLines?: number;
  disabled?: boolean;
  /** A right-hand adornment that is not the password eye — a unit, a suffix icon. */
  trailing?: ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  /** Passed straight through, so a screen can set a keyboard type without a wrapper. */
  inputProps?: Partial<TextInputProps>;
};

export default function Field({
  label,
  value,
  onChangeText,
  hint,
  error,
  placeholder,
  secureEntry = false,
  multiline = false,
  minLines = 3,
  disabled = false,
  trailing,
  testID,
  style,
  inputProps,
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const message = error ?? hint;

  return (
    <View style={[styles.wrap, disabled && styles.disabled, style]}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.box,
          multiline && styles.boxMultiline,
          focused && styles.boxFocused,
          error ? styles.boxError : null,
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textSubtle}
          style={[styles.input, multiline ? { minHeight: minLines * 22 } : null]}
          secureTextEntry={secureEntry && !revealed}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          editable={!disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          testID={testID}
          accessibilityLabel={label}
          {...inputProps}
        />
        {secureEntry ? (
          <Pressable
            onPress={() => setRevealed((previous) => !previous)}
            hitSlop={10}
            style={({ pressed }) => [styles.adornment, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
          >
            <Ionicons
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        ) : trailing ? (
          <View style={styles.adornment}>{trailing}</View>
        ) : null}
      </View>
      {message ? (
        <Text style={[styles.message, error ? styles.messageError : null]}>{message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  disabled: { opacity: 0.55 },
  label: { ...typography.label, color: colors.textMuted },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.control,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
  },
  /** A tall field starts its content at the first line, not the vertical centre. */
  boxMultiline: { alignItems: 'flex-start', paddingVertical: spacing.md },
  boxFocused: { borderColor: colors.blue },
  boxError: { borderColor: colors.red },
  input: { flex: 1, minWidth: 0, ...typography.input, paddingVertical: spacing.md },
  adornment: { alignSelf: 'center' },
  pressed: { opacity: 0.5 },
  message: { ...typography.subtle, color: colors.textSubtle },
  messageError: { ...typography.subtle, color: colors.redText, fontWeight: '700' },
});
