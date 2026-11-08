/**
 * TRACK — bottom sheet.
 *
 * Replaces the centred modal dialog. On a phone held in one hand, a card that
 * appears in the middle of the screen puts its buttons where no thumb reaches,
 * and a full-screen dialog hides the thing you were looking at. A sheet rises
 * from the bottom edge, keeps the page behind it visible under a scrim, and
 * puts its actions at the exact place a thumb already is.
 *
 * This is the surface for: contextual action menus, pickers, filters, short
 * forms. Anything longer than a screenful should still be a route.
 *
 * Drag-to-dismiss is deliberately absent — it needs a gesture library, and a
 * library with native code means the app no longer runs in Expo Go. The scrim,
 * the close button and the hardware back all dismiss it instead, which covers
 * every way a user actually tries to leave one.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, shadows, spacing, typography, scrim } from '../../theme';
import { motion, startMotion } from '../../anim';
import { hapticImpact } from '../../haptics';

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** One quiet line under the title — what this sheet is about. */
  subtitle?: string;
  children: ReactNode;
  /** Pinned below the scroll, above the home indicator. Actions go here. */
  footer?: ReactNode;
  /** `tall` is a sheet that fills most of the screen (a picker with search). */
  size?: 'auto' | 'tall';
};

export default function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'auto',
}: SheetProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [t] = useState(() => new Animated.Value(0));
  // Keep the sheet mounted through its own exit animation, otherwise it
  // disappears the instant the parent flips `visible` and the move is lost.
  // Only ever set to false, and only from the animation callback: the render
  // condition below already covers opening, so nothing has to be queued during
  // the effect.
  const [stillMounted, setStillMounted] = useState(visible);
  const mounted = visible || stillMounted;

  useEffect(() => {
    if (visible) {
      t.setValue(0);
      startMotion(t, motion.sheetIn, () => hapticImpact('medium'));
    } else if (stillMounted) {
      startMotion(t, motion.sheetOut, ({ finished }) => {
        if (finished) setStillMounted(false);
      });
    }
  }, [visible, stillMounted, t]);

  if (!mounted) return null;

  const maxHeight = height * (size === 'tall' ? 0.86 : 0.68);

  return (
    <Modal
      transparent
      visible
      statusBarTranslucent
      animationType="none"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.avoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={[styles.scrim, { opacity: t }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="sheet-scrim"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              maxHeight,
              paddingBottom: insets.bottom + spacing.lg,
              transform: [
                {
                  translateY: t.interpolate({
                    inputRange: [0, 1],
                    outputRange: [maxHeight + insets.bottom + 40, 0],
                  }),
                },
              ],
            },
          ]}
          accessibilityRole="summary"
          testID="sheet"
        >
          <View style={styles.handle} />

          {title ? (
            <View style={styles.headRow}>
              <View style={styles.heads}>
                <Text style={styles.title}>{title}</Text>
                {subtitle ? (
                  <Text style={styles.subtitle} numberOfLines={2}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={({ pressed }) => [styles.close, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : null}

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  avoid: { flex: 1, justifyContent: 'flex-end' },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: scrim,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    ...shadows.lg,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  heads: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.title, fontSize: 20 },
  subtitle: { ...typography.caption },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.quietFill,
  },
  pressed: { opacity: 0.6 },
  body: { flexGrow: 0 },
  bodyContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.lg,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
