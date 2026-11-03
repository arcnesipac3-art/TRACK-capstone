/**
 * TRACK — the "back" affordance that sits above a screen's body.
 *
 * Four screens hand-rolled this row and all four measured 20dp tall: the chevron
 * and its label are both small, so the tap target was the height of a line of
 * text. The touch rule here is 44dp, so the row gets `minHeight: 44` and horizontal
 * padding — the label stays where it reads, the finger gets something to aim at.
 *
 * `accessibilityRole` stays `button` even when the row navigates: on a phone a
 * back affordance is an action, and VoiceOver/TalkBack announce it as one.
 */
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, typography } from '../../theme';

type BackLinkProps = {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

export default function BackLink({ label, onPress, style }: BackLinkProps) {
  return (
    <TouchableOpacity
      style={[styles.row, style]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name="chevron-back-outline" size={18} color={colors.blue} />
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    minHeight: 44,
    paddingRight: spacing.lg,
  },
  label: { ...typography.label, color: colors.blue },
});
