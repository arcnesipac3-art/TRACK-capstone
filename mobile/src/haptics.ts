/**
 * TRACK — haptic feedback.
 *
 * Three meanings, used sparingly: a *selection* when a control commits (a tab,
 * a segment, a day), an *impact* when a row opens, and a *notification* when
 * something is saved or something failed. A phone that buzzes at everything
 * trains the user to ignore it, so nothing here fires on a scroll, a keystroke
 * or an animation frame.
 *
 * `expo-haptics` has no web implementation — this whole module is a no-op
 * there, deliberately, so the Metro web harness used for verification does not
 * fill the console with warnings.
 */
import { Platform } from 'react-native';

type Style = 'light' | 'medium' | 'heavy';
type Notification = 'success' | 'warning' | 'error';

function load() {
  if (Platform.OS === 'web') return null;
  try {
    // Lazy on purpose: a top-level import evaluates the module on web too.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-haptics') as typeof import('expo-haptics');
  } catch {
    // A runtime without the native module (an older Expo Go) must not lose the
    // tap it was wrapping.
    return null;
  }
}

/** The tap of a control committing — a tab, a segment, a day, a chip. */
export function hapticSelection() {
  const Haptics = load();
  if (Haptics) Haptics.selectionAsync().catch(() => {});
}

/** A physical event: a sheet landing, a row opening, a switch flipping. */
export function hapticImpact(style: Style = 'light') {
  const Haptics = load();
  if (!Haptics) return;
  const mapped =
    style === 'heavy'
      ? Haptics.ImpactFeedbackStyle.Heavy
      : style === 'medium'
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light;
  Haptics.impactAsync(mapped).catch(() => {});
}

/** The end of an action — saved, posted, deleted — or the reason it did not happen. */
export function hapticNotification(kind: Notification = 'success') {
  const Haptics = load();
  if (!Haptics) return;
  const mapped =
    kind === 'error'
      ? Haptics.NotificationFeedbackType.Error
      : kind === 'warning'
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Success;
  Haptics.notificationAsync(mapped).catch(() => {});
}
