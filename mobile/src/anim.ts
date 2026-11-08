/**
 * TRACK — motion.
 *
 * Built on React Native's own `Animated`, not Reanimated: the app has to keep
 * running in Expo Go, and a drag-tracked sheet is not worth a development build
 * for a capstone that is judged on the phone. Everything here is opacity and
 * transform, which is what `useNativeDriver` supports, so the animations run on
 * the UI thread and never block a list.
 *
 * Three rules the rest of the app follows:
 * - Motion explains a change, it does not decorate one. Nothing enters slower
 *   than 260ms; nothing loops except a skeleton.
 * - A screen that cannot measure its content (web) still gets the same curve.
 * - The OS can overrule all of it. "Remove animations" is read once here and
 *   every animation in the app asks this module before it moves, so a single
 *   setting — not thirty call sites — decides whether anything travels.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, Easing, LayoutAnimation, Platform } from 'react-native';

/** Curve presets. Short, slightly overshooting, never bouncy for its own sake. */
export const motion = {
  /** A screen's content rising into place. */
  entrance: { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true },
  /** A press: fast in, slower out, so a tap feels like contact. */
  pressIn: { toValue: 1, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true },
  pressOut: { toValue: 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true },
  /** A sheet's panel sliding up from below the edge. */
  sheetIn: { toValue: 1, duration: 280, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true },
  sheetOut: { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true },
  /** A toast arriving (spring) and leaving (fade). */
  toastIn: { useNativeDriver: true, damping: 14, stiffness: 130, mass: 0.6 },
  toastOut: { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true },
  /** A progress fill growing to its value. */
  grow: { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: false },
  /** Skeleton pulse: one breath, held at each end so it never strobes. */
  shimmer: { duration: 1200, easing: Easing.inOut(Easing.quad) },
} as const;

/**
 * The device's "reduce motion" / "remove animations" setting, read once.
 *
 * It is a module store rather than a hook because most of what moves does so from
 * an event handler — a press, a sheet closing — where a hook cannot be called.
 * Anything that also needs to *re-render* on a toggle takes the hook; anything
 * that only needs to know asks `getReduceMotion()` at the moment it would animate.
 *
 * The read is a promise, so the first frames assume motion is allowed. That is the
 * right way to be wrong: a setting nobody has turned on must not cost the app its
 * entrances, and a setting that is on costs one 220ms animation before it lands.
 */
let reduced = false;
let subscribed = false;
const watchers = new Set<() => void>();

function apply(next: boolean) {
  if (next === reduced) return;
  reduced = next;
  watchers.forEach((notify) => notify());
}

function ensureListening() {
  if (subscribed) return;
  subscribed = true;
  // The subscription lives for the life of the app — the setting can change while
  // the app is open, and a screen that is already mounted has to hear about it.
  AccessibilityInfo.addEventListener('reduceMotionChanged', apply);
  AccessibilityInfo.isReduceMotionEnabled()
    .then(apply)
    // No native accessibility bridge (a stripped test harness, some web builds)
    // means no opinion, which is not the same as a request to stop moving.
    .catch(() => {});
}

/** Live value for code that runs outside render. */
export function getReduceMotion(): boolean {
  ensureListening();
  return reduced;
}

/** Live value that re-renders when the user flips the setting. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (notify) => {
      ensureListening();
      watchers.add(notify);
      return () => watchers.delete(notify);
    },
    () => reduced,
    () => reduced
  );
}

/**
 * A motion preset plus the `toValue` it is travelling to. Every animation in the
 * app is described with this, which is what makes the gate one function deep.
 */
export type MotionConfig = {
  toValue: number;
  useNativeDriver: boolean;
  duration?: number;
  delay?: number;
  easing?: (value: number) => number;
  damping?: number;
  stiffness?: number;
  mass?: number;
};

/**
 * Start a preset, honouring the setting: a spring or a timing that would travel
 * instead lands on its end value in the same frame.
 *
 * The end value is applied even when reduced, because callers depend on it — a
 * sheet schedules its own unmount from the callback, a progress bar from the
 * number it reached. Landing is not the same as skipping.
 */
export function startMotion(
  value: Animated.Value,
  config: MotionConfig,
  done?: (result: { finished: boolean }) => void
): void {
  if (reduced) {
    value.setValue(config.toValue);
    done?.({ finished: true });
    return;
  }

  if (config.damping !== undefined) {
    Animated.spring(value, config).start(done);
    return;
  }

  Animated.timing(value, config).start(done);
}

/**
 * Press feedback that reads as touch rather than as a colour change.
 *
 * `activeOpacity` alone is the flat thing it has always been; a 1.5% scale under
 * the finger is what makes a control on a phone feel like a control. Spread the
 * returned props onto a `Pressable` and merge `pressStyle` into its style.
 *
 * `restingOpacity` exists because this style is animated, and an animated `opacity`
 * overrides a static one in the same array however you order them — so a disabled
 * control that dims through a stylesheet rule alone never actually dims. Pass the
 * dim here and it is the floor the press animation works down from.
 *
 * Reduced motion drops the zoom and keeps the dim. The setting asks for nothing to
 * travel; a control that stopped responding to a tap would be a worse trade than a
 * colour change that arrives in no time at all.
 */
export function usePress({ restingOpacity = 1 }: { restingOpacity?: number } = {}) {
  const [progress] = useState(() => new Animated.Value(0));
  const reduced = useReducedMotion();

  const onPressIn = useCallback(() => {
    startMotion(progress, { ...motion.pressIn, toValue: 1 });
  }, [progress]);

  const onPressOut = useCallback(() => {
    startMotion(progress, { ...motion.pressOut, toValue: 0 });
  }, [progress]);

  const pressStyle = {
    transform: [
      {
        scale: progress.interpolate({
          inputRange: [0, 1],
          outputRange: reduced ? [1, 1] : [1, 0.985],
        }),
      },
    ],
    opacity: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [restingOpacity, restingOpacity * 0.88],
    }),
  };

  return { onPressIn, onPressOut, pressStyle };
}

/**
 * Entrance motion for content that appears — a screen after a tab switch, a row
 * after a filter change, a section after its data lands.
 *
 * `key` restarts the animation when the identity of what is on screen changes,
 * which is the part that makes a filter feel instant rather than broken. `rise`
 * is how far the content travels, in dp; a card wants less than a whole screen.
 * `delay` holds the start back, which is how two surfaces on one screen are made
 * to arrive one after the other instead of as a single block.
 *
 * `restart` is for content that arrives on an event the app cannot express as a
 * key — a focus, in `Screen`'s case — and it is stable, so it can go straight
 * into `useFocusEffect`.
 */
export function useEntrance(
  key: unknown = null,
  { rise = 10, delay = 0 }: { rise?: number; delay?: number } = {}
) {
  const [t] = useState(() => new Animated.Value(0));
  const reduced = useReducedMotion();

  const restart = useCallback(() => {
    t.setValue(0);
    startMotion(t, { ...motion.entrance, toValue: 1, delay });
  }, [t, delay]);

  useEffect(() => {
    restart();
  }, [restart, key, reduced]);

  return {
    opacity: t,
    translateY: t.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }),
    restart,
  };
}

/**
 * A looping pulse for skeleton blocks. Returns the raw value so a caller can
 * interpolate its own brightness range — a card shimmers differently from a bar.
 *
 * Reduced motion stops the loop rather than freezing it mid-breath: a skeleton
 * that never pulses is still the right grey, which is why the resting value is
 * the middle of the range and not either end.
 */
export function useShimmer() {
  const [t] = useState(() => new Animated.Value(0));
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      t.setValue(0.5);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, {
          toValue: 1,
          duration: motion.shimmer.duration / 2,
          easing: motion.shimmer.easing,
          // A skeleton pulses opacity only, which the native driver does support —
          // so the loop never competes with the JS thread that is still fetching
          // the data the skeleton is standing in for.
          useNativeDriver: true,
        }),
        Animated.timing(t, {
          toValue: 0,
          duration: motion.shimmer.duration / 2,
          easing: motion.shimmer.easing,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t, reduced]);

  return t;
}

/**
 * Grow a bar to its value the first time it is laid out.
 *
 * Layout props cannot go through the native driver, so this is a width/height
 * animation on the JS thread — used once per visible card, not per row.
 */
export function useGrow(ratio: number) {
  const [t] = useState(() => new Animated.Value(0));
  const reduced = useReducedMotion();
  const target = `${Math.round(ratio * 100)}%`;

  useEffect(() => {
    t.setValue(0);
    startMotion(t, { ...motion.grow, toValue: 1 });
  }, [t, ratio, reduced]);

  return reduced ? target : t.interpolate({ inputRange: [0, 1], outputRange: ['0%', target] });
}

/**
 * `LayoutAnimation` is the one API whose web dialect differs enough to be worth
 * hiding: enabling it on Android is what makes an expand/collapse animate, and
 * on web the global config object does not exist in the same shape.
 */
export function animateLayout() {
  if (getReduceMotion()) return;
  if (Platform.OS === 'android') {
    LayoutAnimation.configureNext({
      duration: 200,
      create: { type: 'easeIn', property: 'opacity' },
      update: { type: 'easeIn', duration: 200 },
    });
  }
}
