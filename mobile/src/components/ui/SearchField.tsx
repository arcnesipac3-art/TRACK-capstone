/**
 * TRACK — search field.
 *
 * Six screens had re-typed a `TextInput` with a magnifier and their own paddings;
 * none of them agreed about corner radius, and two could not be cleared once you
 * had mistyped. One surface, one height, and an explicit clear.
 *
 * It keeps its own focus ring in brand blue rather than the platform default, which
 * on Android is a thin line that reads as a form field rather than as a search.
 */
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, typography } from '../../theme';
import { hapticSelection } from '../../haptics';

type SearchFieldProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Fires on the keyboard's search key — the server-side filter, not a local scan. */
  onSubmit?: () => void;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export default function SearchField({
  value,
  onChange,
  placeholder = 'Search',
  onSubmit,
  autoFocus = false,
  style,
  testID,
}: SearchFieldProps) {
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrap, focused && styles.wrapFocused, style]}>
      <Ionicons name="search" size={18} color={colors.textSubtle} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        style={styles.input}
        testID={testID ?? 'search-field'}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityRole="search"
        accessibilityLabel={placeholder}
        clearButtonMode="never"
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => {
            hapticSelection();
            onChange('');
            ref.current?.focus();
          }}
          hitSlop={10}
          style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Ionicons name="close-circle" size={18} color={colors.textSubtle} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
  },
  wrapFocused: { borderColor: colors.blue, backgroundColor: colors.surface },
  input: {
    flex: 1,
    minWidth: 0,
    ...typography.input,
    paddingVertical: spacing.sm,
  },
  clear: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.5 },
});
