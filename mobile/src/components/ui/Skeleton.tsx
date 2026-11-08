/**
 * TRACK — skeleton loading.
 *
 * `LoadingState` was a spinner in the middle of an empty page: the user stared at
 * a spinner, then the spinner was replaced by a page, and nothing in between told
 * them what was about to arrive. A skeleton holds the shape of the content that is
 * coming — same rows, same chip circles, same measure — so the page does not jump
 * when the data lands.
 *
 * The blocks are the anatomy of a real `ListRow` and a real card, not generic
 * grey bars, which is the difference between a loading screen and a placeholder.
 */
import { Animated, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useShimmer } from '../../anim';
import { colors, radius, spacing } from '../../theme';

/** One pulsing block. `width` accepts a percentage so it can sit in a row. */
export function SkeletonBlock({
  width = '100%',
  height = 12,
  radius: corner = radius.sm,
  style,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useShimmer();
  return (
    <Animated.View
      style={[
        styles.block,
        { width, height, borderRadius: corner, opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.95] }) },
        style,
      ]}
    />
  );
}

/** The icon-chip circle a `ListRow` opens with. */
export function SkeletonAvatar({ size = 44 }: { size?: number }) {
  const t = useShimmer();
  return (
    <Animated.View
      style={[
        styles.block,
        {
          width: size,
          height: size,
          borderRadius: radius.pill,
          opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.95] }),
        },
      ]}
    />
  );
}

/** A row shaped like the ones that will replace it: chip, two lines, a meta stub. */
export function SkeletonRow({ lines = 2 }: { lines?: number }) {
  return (
    <View style={styles.row}>
      <SkeletonAvatar />
      <View style={styles.lines}>
        <SkeletonBlock height={14} width="62%" />
        {lines > 1 ? <SkeletonBlock height={11} width="84%" /> : null}
      </View>
      <SkeletonBlock height={11} width={44} />
    </View>
  );
}

/** A full list inside the surface the real list will sit on. */
export function SkeletonList({ rows = 5, asCard = true }: { rows?: number; asCard?: boolean }) {
  return (
    <View style={[asCard && styles.card, asCard && { overflow: 'hidden' }]}>
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonRow key={index} />
      ))}
    </View>
  );
}

/** The stat grid shape, for a dashboard that is still counting. */
export function SkeletonTiles({ tiles = 4 }: { tiles?: number }) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: tiles }, (_, index) => (
        <View key={index} style={styles.tile}>
          <SkeletonBlock height={10} width="45%" />
          <SkeletonBlock height={24} width="60%" />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.quietFill },
  card: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  lines: { flex: 1, minWidth: 0, gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
});
