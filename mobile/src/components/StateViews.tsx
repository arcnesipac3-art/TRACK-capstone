/**
 * Shared loading / empty / error views.
 *
 * Every screen that talks to the API uses these so a failed request looks
 * different from "there is nothing here" — previously failures were only
 * `console.warn`ed and the screen looked legitimately empty.
 */
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';

import { colors, spacing, radius, typography } from '../theme';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.navy700} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  inline = false,
}: {
  title: string;
  body?: string;
  /**
   * Render without flex:1 — for lists inside a ScrollView, where there is no
   * fixed height to fill (flex:1 made empty screens collapse to the top).
   */
  inline?: boolean;
}) {
  return (
    <View style={[styles.center, inline && styles.centerInline]}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.muted}>{body}</Text> : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = 'Try again',
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={[styles.muted, styles.errorText]}>{message}</Text>
      {onRetry && (
        <TouchableOpacity
          style={styles.retry}
          onPress={onRetry}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
        >
          <Text style={styles.retryLabel}>{retryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Inline (non-fullscreen) banner variant for lists that already render rows. */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.banner}>
      <Text style={[styles.muted, styles.errorText]}>{message}</Text>
      {onRetry && (
        <TouchableOpacity onPress={onRetry} accessibilityRole="button">
          <Text style={styles.bannerRetry}>Try again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.bg,
  },
  centerInline: {
    flex: 0,
    paddingVertical: spacing.xxl,
  },
  title: { ...typography.heading, color: colors.navy900, textAlign: 'center' },
  muted: { ...typography.muted, textAlign: 'center' },
  errorText: { color: colors.red700 },
  retry: {
    marginTop: spacing.md,
    backgroundColor: colors.navy700,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  retryLabel: { ...typography.buttonText, color: colors.onNavy },
  banner: {
    backgroundColor: colors.red100,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
  },
  bannerRetry: { ...typography.label, color: colors.navy700 },
});
