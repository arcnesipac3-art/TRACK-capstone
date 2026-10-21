/**
 * Sign-out control shared by every dashboard.
 *
 * Revokes the server-side token first (auth.logout), then flips the shared
 * auth snapshot, which swaps RootLayout back to the login stack — no app
 * restart needed.
 */
import { useState } from 'react';
import { router } from 'expo-router';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';

import { colors, spacing, radius, typography } from '../theme';
import { auth } from '../api/client';

export default function SignOutButton({ variant = 'surface' }: { variant?: 'surface' | 'onNavy' }) {
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await auth.logout();
      // Explicit forward, same reason as login: the snapshot swap changes
      // which stack RootLayout declares, but the URL keeps pointing at the
      // old screen, so navigate to the login form directly.
      router.replace('/login');
    } finally {
      setBusy(false);
    }
  };

  const onNavy = variant === 'onNavy';

  return (
    <TouchableOpacity
      style={[styles.button, onNavy && styles.buttonOnNavy, busy && { opacity: 0.6 }]}
      onPress={handleSignOut}
      disabled={busy}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Sign out"
    >
      {busy ? (
        <ActivityIndicator size="small" color={onNavy ? colors.onNavy : colors.navy700} />
      ) : (
        <Text style={[styles.label, onNavy && styles.labelOnNavy]}>Sign out</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignSelf: 'flex-end',
  },
  buttonOnNavy: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  label: { ...typography.label, color: colors.navy700 },
  labelOnNavy: { color: colors.onNavy },
});
