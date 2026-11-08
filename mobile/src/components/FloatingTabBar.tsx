/**
 * TRACK — floating island tab bar.
 *
 * A detached pill: rounded, elevated, inset from the edges and lifted clear of the
 * gesture bar. It replaces the default full-width strip, which welded the navigation
 * to the bottom of the display and made six stops look like a spreadsheet header.
 *
 * What changed in this pass:
 *
 * - Stops are equal width and the active one is marked by a navy capsule that
 *   *slides* between them, so switching modules reads as moving between places
 *   instead of two panels swapping instantly. Only the focused stop carries a label,
 *   which is what lets six stops fit a 360dp phone without truncating one.
 * - Every stop is 48dp tall inside a 53dp-wide cell, so no target in the app is
 *   smaller than the 44dp floor — including on a small phone with six modules.
 * - A tab switch produces one haptic tick. A long-press does nothing, because a
 *   navigation bar that also does other things is not a navigation bar.
 *
 * Behaviours of the default bar that this app depends on are re-implemented here:
 *
 * 1. Stops whose screen sets `tabBarButton: () => null` are not drawn. The
 *    navigator still hands them over — only `hidden: true` removes a route from
 *    `state.routes` — so a custom bar must filter them or render empty gaps.
 * 2. `tabBarBadge` is honoured, with its per-tab style, because the Messages stop
 *    publishes the server's unread count through it.
 * 3. Pressing a stop emits `tabPress` and only navigates when no listener prevented
 *    default, matching the default bar so a screen can veto a switch.
 *
 * The island highlights the stop that *owns* the focused route, so opening a thread
 * still reads as "Messages". A screen folded off the island lights nothing — no other
 * stop owns it, and highlighting an unrelated one would report a place you are not.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';

import { colors, radius, shadows, spacing, typography } from '../theme';
import { hapticSelection } from '../haptics';
import { tabSelected } from '../a11y';
import { startMotion } from '../anim';

/** Height of the island itself, shared with the scene clearance below it. */
export const ISLAND_HEIGHT = 60;
/** Gap between the island and the bottom safe-area edge. */
export const ISLAND_BOTTOM_GAP = 10;
/** Horizontal inset from the screen edges. */
export const ISLAND_SIDE_MARGIN = 14;
/** Inner padding of the pill, and the gutter around each capsule. */
const ISLAND_PADDING = 6;

/**
 * How much bottom padding a screen's scene needs to keep its last row tappable.
 *
 * The island is absolutely positioned, so it floats over the scene instead of pushing
 * it up the way the default bar did. Every tab scene gets this through
 * `screenOptions.sceneStyle`.
 */
export function islandClearance(insetBottom: number) {
  return ISLAND_HEIGHT + ISLAND_BOTTOM_GAP + insetBottom + spacing.sm;
}

type IconProps = { focused: boolean; color: string; size: number };

function renderIcon(icon: ((props: IconProps) => ReactNode) | undefined, focused: boolean) {
  const color = focused ? colors.onNavy : colors.textMuted;
  if (!icon) {
    // A screen without an icon would otherwise be an invisible tap target.
    return <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: color }} />;
  }
  return icon({ focused, color, size: 21 });
}

/** Unread count pinned to the top-right of a stop's icon. */
function Badge({ value, style }: { value: string | number; style?: StyleProp<TextStyle> }) {
  const flat = StyleSheet.flatten(style) ?? {};
  const label = typeof value === 'number' && value > 99 ? '99+' : String(value);
  return (
    <View
      pointerEvents="none"
      style={[styles.badge, flat.backgroundColor ? { backgroundColor: flat.backgroundColor } : null]}
      accessibilityLabel={`${label} unread`}
    >
      <Text style={[styles.badgeText, flat.fontSize ? { fontSize: flat.fontSize } : null]}>
        {label}
      </Text>
    </View>
  );
}

/**
 * expo-router does not render `tabBar` — it *calls* it, inside a
 * `SafeAreaInsetsContext.Consumer`, so this outer function must not touch a
 * hook. All of the state lives in `Island`, which is returned as an element and
 * therefore rendered as a real component.
 */
export default function FloatingTabBar(props: BottomTabBarProps) {
  return <Island {...props} />;
}

function Island({
  state,
  descriptors,
  emitter,
  navigateToTab,
  insets,
}: BottomTabBarProps) {
  const stops = state.routes.filter((route) => {
    const options = descriptors[route.key]?.options;
    return options && options.tabBarButton === undefined;
  });

  const focusedRoute = state.routes[state.index];
  const focusedSegments = (focusedRoute?.name ?? '').split('/');
  const ownerIndex = stops.findIndex((route) => {
    if (route.key === focusedRoute?.key) return true;
    const segments = route.name
      .split('/')
      .filter((part, i, all) => !(part === 'index' && i === all.length - 1));
    return (
      segments.length > 0 &&
      segments.length < focusedSegments.length &&
      segments.every((part, i) => focusedSegments[i] === part)
    );
  });
  const owner = ownerIndex >= 0 ? stops[ownerIndex] : undefined;

  // The capsule can only travel a distance the bar has measured, so the island
  // reports its own width once and the slide is armed from then on.
  const [islandWidth, setIslandWidth] = useState(0);
  const [slide] = useState(() => new Animated.Value(0));
  const stopWidth = stops.length > 0 ? (islandWidth - ISLAND_PADDING * 2) / stops.length : 0;

  useEffect(() => {
    if (stopWidth <= 0 || ownerIndex < 0) return;
    startMotion(slide, {
      toValue: ownerIndex * stopWidth,
      duration: 240,
      easing: Easing.out(Easing.back(1.1)),
      useNativeDriver: true,
    });
  }, [ownerIndex, slide, stopWidth]);

  return (
    <View
      accessibilityRole="tablist"
      testID="floating-tab-bar"
      onLayout={(event) => setIslandWidth(event.nativeEvent.layout.width)}
      style={[
        styles.island,
        {
          bottom: insets.bottom + ISLAND_BOTTOM_GAP,
          left: ISLAND_SIDE_MARGIN,
          right: ISLAND_SIDE_MARGIN,
          height: ISLAND_HEIGHT,
        },
      ]}
    >
      {stopWidth > 0 && ownerIndex >= 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.capsuleHolder,
            {
              width: stopWidth,
              top: ISLAND_PADDING,
              bottom: ISLAND_PADDING,
              transform: [{ translateX: slide }],
            },
          ]}
        >
          <View style={styles.capsule} />
        </Animated.View>
      ) : null}

      {stops.map((route) => {
        const descriptor = descriptors[route.key];
        const options = descriptor.options;
        const focused = route.key === focusedRoute?.key;
        const active = route.key === owner?.key;
        const title = typeof options.title === 'string' ? options.title : route.name;
        const badge = options.tabBarBadge;

        const onPress = () => {
          const event = emitter.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            hapticSelection();
            navigateToTab(route.key);
          } else if (focused) {
            // Re-tapping the tab you are on is a no-op the default bar also ignores,
            // but the tick confirms the finger landed somewhere.
            hapticSelection();
          }
        };

        const selectionProps = tabSelected(active);

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
            accessibilityRole="tab"
            accessibilityLabel={title}
            testID={`floating-tab-${route.name.replace(/[^a-zA-Z0-9]+/g, '-')}`}
            style={({ pressed }) => [styles.stop, pressed && styles.stopPressed]}
            {...selectionProps}
          >
            <View style={styles.iconWrap}>
              {renderIcon(options.tabBarIcon, active)}
              {badge !== undefined && badge !== null && badge !== '' ? (
                <Badge value={badge} style={options.tabBarBadgeStyle} />
              ) : null}
            </View>
            {active ? (
              <Text numberOfLines={1} style={styles.label}>
                {title}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  island: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: ISLAND_PADDING,
    ...shadows.md,
  },
  capsuleHolder: { position: 'absolute', left: ISLAND_PADDING },
  capsule: {
    flex: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
  },
  stop: {
    flex: 1,
    height: '100%',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: 2,
    gap: 1,
  },
  stopPressed: { opacity: 0.7 },
  iconWrap: { width: 24, alignItems: 'center' },
  /**
   * The name goes under the icon, not beside it: six stops on a 360dp phone are
   * 55dp wide, and a label sharing that row with a 24dp glyph gets three
   * characters and an ellipsis. Under the icon it has the full stop.
   */
  label: {
    ...typography.micro,
    fontSize: 10,
    letterSpacing: 0.2,
    color: colors.onNavy,
    textAlign: 'center',
    maxWidth: '100%',
  },
  badge: {
    position: 'absolute',
    top: -7,
    right: -9,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...typography.micro, fontSize: 10, color: colors.onNavy },
});
