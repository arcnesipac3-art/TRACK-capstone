/**
 * TRACK — the three states a screen can be in that are not "content".
 *
 * Loading, empty and broken look deliberately different: a spinner in the middle of a
 * blank page told you nothing about which of the three you had, and previously a failed
 * request was a `console.warn` and a screen that looked legitimately empty.
 *
 * In this pass each one earns its place on the page. A load uses a skeleton when the
 * caller knows the shape of what is coming — that is the `rows` variant, and it is the
 * difference between "something is happening" and "here is where your list will be". An
 * empty state names what is missing and, when there is a way to fix it from right there,
 * offers it. A retry is a button, not a link, because it is the primary action of the
 * screen at that moment.
 */
import type { ComponentProps } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useEntrance } from '../anim';
import { colors, radius, spacing, touch, typography } from '../theme';
import { hapticImpact } from '../haptics';
import { SkeletonList } from './ui/Skeleton';

type Glyph = ComponentProps<typeof Ionicons>['name'];

/** Every state that appears on a screen arrives the same way content does. */
function useArrival(key: unknown) {
  const entrance = useEntrance(key);
  return { opacity: entrance.opacity, transform: [{ translateY: entrance.translateY }] };
}

/**
 * A load in progress. With `rows` it holds the shape of the list that is coming;
 * without it it is the centred spinner, which is right for a first paint where the
 * shape is not yet known.
 */
export function LoadingState({
  label = 'Loading…',
  rows,
}: {
  label?: string;
  rows?: number;
}) {
  const arriving = useArrival(label);

  if (rows !== undefined) {
    return (
      <Animated.View
        style={[styles.skeletonWrap, arriving]}
        accessibilityRole="progressbar"
        accessibilityLabel={label}
      >
        <SkeletonList rows={rows} />
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.centered, arriving]} accessibilityRole="progressbar">
      <View style={styles.spinnerDisc}>
        <ActivityIndicator size="small" color={colors.onNavy} />
      </View>
      <Text style={styles.muted}>{label}</Text>
    </Animated.View>
  );
}

/** Nothing to show — said plainly, with the fix attached when there is one. */
export function EmptyState({
  title,
  body,
  icon = 'file-tray-outline',
  inline = false,
  actionLabel,
  onAction,
}: {
  title: string;
  body?: string;
  icon?: Glyph;
  /**
   * Render without filling the viewport — for a list inside a ScrollView, where
   * flex:1 would collapse the space to nothing.
   */
  inline?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const arriving = useArrival(title);

  return (
    <Animated.View style={[styles.centered, inline && styles.centeredInline, arriving]}>
      <View style={styles.stateDisc}>
        <Ionicons name={icon} size={24} color={colors.blueText} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={[styles.muted, styles.measure]}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={() => {
            hapticImpact('light');
            onAction();
          }}
          style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryActionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

/** A request failed. Distinct from empty, and always with a way to try again. */
export function ErrorState({
  message,
  onRetry,
  retryLabel = 'Try again',
  title = 'Something went wrong',
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  title?: string;
}) {
  const arriving = useArrival(title);

  return (
    <Animated.View style={[styles.centered, arriving]}>
      <View style={[styles.stateDisc, { backgroundColor: colors.redTint }]}>
        <Ionicons name="cloud-offline-outline" size={24} color={colors.redText} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={[styles.muted, styles.measure]}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={() => {
            hapticImpact('light');
            onRetry();
          }}
          style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryActionLabel}>{retryLabel}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

/** Inline variant, for a list that already renders rows around the failure. */
export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={18} color={colors.redText} />
      <Text style={[styles.bannerText, styles.measure]}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          hitSlop={10}
          style={({ pressed }) => [styles.bannerRetry, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.bannerRetryLabel}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
    backgroundColor: colors.bg,
  },
  centeredInline: { flex: 0, paddingVertical: spacing.xxxl },
  skeletonWrap: { gap: spacing.md },
  stateDisc: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blueTint,
  },
  spinnerDisc: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
  },
  title: { ...typography.heading, textAlign: 'center' },
  muted: { ...typography.muted, textAlign: 'center' },
  /** A line of advice is readable at about 40ch; full-bleed sentences are not. */
  measure: { maxWidth: 320 },
  pressed: { opacity: 0.85 },
  primaryAction: {
    marginTop: spacing.sm,
    minHeight: touch.target,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.navy,
    borderRadius: radius.control,
    paddingHorizontal: spacing.xxl,
  },
  primaryActionLabel: { ...typography.buttonText, color: colors.onNavy },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.redTint,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  bannerText: { ...typography.caption, color: colors.redText, flex: 1 },
  bannerRetry: { minHeight: touch.inline, justifyContent: 'center', paddingHorizontal: spacing.sm },
  bannerRetryLabel: { ...typography.buttonText, fontSize: 13, color: colors.redText },
});
