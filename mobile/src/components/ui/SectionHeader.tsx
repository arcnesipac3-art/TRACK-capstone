/**
 * TRACK — section header with one action.
 *
 * Khan Academy composes a home screen as bold title on the left, a single blue
 * text action on the right, and the content under it ("My courses" · Edit).
 * Exactly one action, because two competing links turn a heading into a menu.
 *
 * Before this, a dashboard section made its *title* the tap target, which read
 * as a heading and gave nothing away. Now the heading is static and the route it
 * opens is named where you would expect to press.
 */
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, spacing, typography } from '../../theme';

type SectionHeaderProps = {
  title: string;
  /** Supporting line under the title, for a count or a filter that is active. */
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function SectionHeader({ title, detail, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.titles}>
        <Text style={styles.title}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity
          style={styles.action}
          onPress={onAction}
          activeOpacity={0.7}
          accessibilityRole="link"
          accessibilityLabel={`${actionLabel} — ${title}`}
        >
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titles: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.heading },
  detail: { ...typography.subtle },
  action: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  actionLabel: {
    ...typography.muted,
    fontWeight: '700',
    color: colors.blue,
  },
});
