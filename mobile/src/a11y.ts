/**
 * TRACK — accessibility dialects.
 *
 * `accessibilityState` is what React Native reads; react-native-web drops it for
 * a selected control and only honours the ARIA attribute. Every selectable
 * control in the app therefore states its selection twice, in the dialect of the
 * platform that is rendering it — otherwise the Metro web harness used for
 * verification is blind to which segment, day or tab is active.
 */
import { Platform } from 'react-native';

/** For a control inside a `tablist`: which one is chosen. */
export function tabSelected(active: boolean): Record<string, unknown> {
  return Platform.OS === 'web'
    ? { 'aria-selected': active }
    : { accessibilityState: { selected: active } };
}
