/**
 * TRACK — the messaging socket's state, said once.
 *
 * The inbox and every thread used to describe the connection in their own subtitle
 * wording, which meant the same fallback read three ways across four screens. A
 * connection is either live, arriving, or not arriving, and the one thing a reader
 * needs to know in the last case is that writing still works — sending falls back to
 * HTTPS, so a grey dot is not a broken app.
 *
 * It sits in the header's right slot, where the account actions live on a dashboard:
 * a status belongs somewhere that does not move when the content scrolls.
 */
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';
import type { SocketStatus } from './realtime';

export default function ConnectionPill({ status }: { status: SocketStatus }) {
  const tone =
    status === 'live'
      ? { dot: colors.green, label: 'Live', hint: 'Live connection' }
      : status === 'connecting'
        ? { dot: colors.gold, label: 'Connecting', hint: 'Connecting' }
        : status === 'signed-out'
          ? { dot: colors.borderStrong, label: 'Signed out', hint: 'Signed out' }
          : { dot: colors.borderStrong, label: 'Send still works', hint: 'Reconnecting; sending still works' };

  return (
    <View style={styles.pill} accessibilityLabel={tone.hint}>
      <View style={[styles.dot, { backgroundColor: tone.dot }]} />
      <Text style={styles.label}>{tone.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-end',
    minHeight: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.quietFill,
  },
  dot: { width: 7, height: 7, borderRadius: radius.pill },
  label: { ...typography.micro, color: colors.textMuted },
});
