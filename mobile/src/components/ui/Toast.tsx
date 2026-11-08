/**
 * TRACK — transient feedback, one place.
 *
 * Five screens had invented their own version of this: a `notice` state rendered
 * as coloured text inside the card, which the user had to scroll back to and
 * which never went away. A saved action deserves a signal that does not move the
 * page, so it gets one here.
 *
 * It drops from the top rather than rising from the bottom: the bottom of every
 * screen in this app is spoken for by the tab island.
 *
 * Only one toast is live at a time — the newest replaces the previous one. On a
 * phone, a stack of three confirmations is three things to dismiss before
 * working again.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, shadows, spacing, typography } from '../../theme';
import { motion, startMotion } from '../../anim';
import { hapticNotification } from '../../haptics';

export type ToastTone = 'success' | 'error' | 'info';

type ToastInput = {
  title: string;
  body?: string;
  tone?: ToastTone;
  /** Milliseconds before it leaves. Ignored when `actionLabel` is set. */
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastApi = {
  show: (input: ToastInput) => void;
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
};

const CONTEXT_DEFAULT: ToastApi = {
  show: () => {},
  success: () => {},
  error: () => {},
};

const ToastContext = createContext<ToastApi>(CONTEXT_DEFAULT);

/** Read the app's toast surface. Safe to call outside a provider. */
export function useToast() {
  return useContext(ToastContext);
}

const GLYPH: Record<ToastTone, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
};

const TINT: Record<ToastTone, { bg: string; fg: string }> = {
  success: { bg: colors.navy, fg: colors.green },
  error: { bg: colors.navy, fg: colors.red },
  info: { bg: colors.navy, fg: colors.blue },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<ToastInput | null>(null);
  const [t] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    startMotion(t, motion.toastOut, ({ finished }) => {
      if (finished) setCurrent(null);
    });
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, [t]);

  const show = useCallback(
    (input: ToastInput) => {
      const tone = input.tone ?? 'info';
      hapticNotification(tone === 'error' ? 'error' : tone === 'success' ? 'success' : 'warning');
      if (timer.current) clearTimeout(timer.current);
      t.setValue(0);
      setCurrent(input);
      startMotion(t, { ...motion.toastIn, toValue: 1 });
      // An action is a question, so it waits for an answer; a confirmation does not.
      if (!input.actionLabel) {
        timer.current = setTimeout(dismiss, input.duration ?? 2600);
      }
    },
    [dismiss, t]
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, body) => show({ title, body, tone: 'success' }),
      error: (title, body) => show({ title, body, tone: 'error' }),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={api}>
      <View style={styles.root}>
        {children}
        {current ? (
          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.wrap,
              {
                top: insets.top + spacing.sm,
                opacity: t,
                transform: [
                  { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) },
                ],
              },
            ]}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            testID="toast"
          >
            <View style={[styles.toast, { backgroundColor: TINT[current.tone ?? 'info'].bg }]}>
              <Ionicons
                name={GLYPH[current.tone ?? 'info']}
                size={20}
                color={TINT[current.tone ?? 'info'].fg}
              />
              <View style={styles.texts}>
                <Text style={styles.title} numberOfLines={2}>
                  {current.title}
                </Text>
                {current.body ? (
                  <Text style={styles.body} numberOfLines={2}>
                    {current.body}
                  </Text>
                ) : null}
              </View>
              {current.actionLabel ? (
                <Pressable
                  onPress={() => {
                    current.onAction?.();
                    dismiss();
                  }}
                  hitSlop={8}
                  style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
                  accessibilityRole="button"
                >
                  <Text style={styles.actionLabel}>{current.actionLabel}</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={dismiss}
                  hitSlop={10}
                  style={({ pressed }) => [styles.close, pressed && styles.actionPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss"
                >
                  <Ionicons name="close" size={16} color={colors.onNavyMuted} />
                </Pressable>
              )}
            </View>
          </Animated.View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  wrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 50,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    paddingLeft: spacing.lg,
    borderRadius: radius.lg,
    ...shadows.md,
  },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.subhead, color: colors.onNavy },
  body: { ...typography.caption, color: colors.onNavyMuted },
  action: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
    backgroundColor: colors.navySoft,
  },
  actionPressed: { opacity: 0.75 },
  actionLabel: { ...typography.buttonText, color: colors.onNavy },
  close: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
