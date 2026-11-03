/**
 * TRACK — the two account actions every dashboard header offers.
 *
 * The web app puts Profile (`/profile`) and sign-out in each role's sidebar;
 * on a phone there is no sidebar, so they live in the header instead. Kept as
 * one component because the pair always appears together, and the row is the
 * only part of it that is not already a shared button.
 */
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, typography } from '../../theme';
import SignOutButton from '../SignOutButton';

export default function HeaderActions({ variant = 'onNavy' }: { variant?: 'surface' | 'onNavy' }) {
  const onNavy = variant === 'onNavy';
  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.button, onNavy && styles.buttonOnNavy]}
        onPress={() => router.push('/profile')}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="My profile"
      >
        <Ionicons
          name="person-outline"
          size={18}
          color={onNavy ? colors.onNavy : colors.blue}
        />
        <Text style={[styles.micro, onNavy && styles.microOnNavy]}>ACCOUNT</Text>
      </TouchableOpacity>
      <SignOutButton variant={variant} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-end',
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  buttonOnNavy: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  micro: { ...typography.label, color: colors.blue },
  microOnNavy: { color: colors.onNavy },
});
