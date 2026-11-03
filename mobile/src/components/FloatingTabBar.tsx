/**
 * TRACK — floating island tab bar.
 *
 * Replaces the default full-width bar (a 56px strip welded to the bottom edge)
 * with a detached pill: rounded, elevated, inset from the screen edges and
 * lifted clear of the home-indicator safe area. Only the focused stop carries a
 * label — the others stay icon-only — so six stops fit a 360dp phone without
 * truncating anything, and the highlight reads as a moving capsule rather than
 * a recoloured cell.
 *
 * The installed SDK has no floating tab bar to opt into: `Variant` is
 * `'uikit' | 'material'`, so this is a custom `tabBar` component, exactly the
 * contract react-navigation's BottomTabBar implements (`tabBar?: (props:
 * BottomTabBarProps) => React.ReactNode`, passed as a `<Tabs>` prop).
 *
 * Two behaviours of the default bar are re-implemented here, because they are
 * the ones this app depends on:
 *
 * 1. Stops whose screen sets `tabBarButton: () => null` (thread screens, fee
 *    editors) are *not* drawn. The navigator still hands them to the bar — only
 *    `hidden: true` removes a route from `state.routes` — so a custom bar has to
 *    filter them itself or it would render empty gaps.
 * 2. `tabBarBadge` is honoured, including the per-tab `tabBarBadgeStyle`, since
 *    the Messages stop publishes the server's unread count through it.
 * 3. Pressing a stop emits `tabPress` first and only navigates when no listener
 *    prevented default, matching the default bar so a screen can veto a switch.
 *
 * The island also highlights the stop that *owns* the focused route, so opening
 * a thread still reads as "Messages" instead of leaving the bar unhighlighted.
 * A screen that is folded off the bar (a role's sixth-plus screen, declared with
 * `tabBarButton`) lights nothing: no other stop owns it, and highlighting an
 * unrelated one would report a place the teacher is not looking at.
 */
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';

import { colors, fontFamily, shadows } from '../theme';

/** Height of the island itself, shared with the scene padding below it. */
export const ISLAND_HEIGHT = 58;
/** Gap between the island and the bottom safe-area edge. */
export const ISLAND_BOTTOM_GAP = 10;
/** Horizontal inset from the screen edges. */
export const ISLAND_SIDE_MARGIN = 14;

/**
 * How much bottom padding a screen's scene needs to keep its last row tappable.
 *
 * The island is absolutely positioned, so it floats over the scene instead of
 * pushing it up the way the default bar did. Every tab scene therefore gets this
 * much clearance through `screenOptions.sceneStyle`.
 */
export function islandClearance(insetBottom: number) {
  return ISLAND_HEIGHT + ISLAND_BOTTOM_GAP + insetBottom + 8;
}

type IconProps = { focused: boolean; color: string; size: number };

function renderIcon(icon: ((props: IconProps) => ReactNode) | undefined, focused: boolean) {
  const color = focused ? colors.onNavy : colors.textMuted;
  if (!icon) {
    // A screen without an icon would otherwise be an invisible tap target.
    return <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: color }} />;
  }
  return icon({ focused, color, size: 20 });
}

/**
 * Unread count pinned to the top-right of a stop.
 *
 * The default bar anchors the badge to the label; the island has no visible
 * label on inactive stops, so it is anchored to the icon instead. The tab's own
 * `tabBarBadgeStyle` (background, font size) still wins.
 */
function Badge({ value, style }: { value: string | number; style?: StyleProp<TextStyle> }) {
  const flat = StyleSheet.flatten(style) ?? {};
  const label = typeof value === 'number' && value > 99 ? '99+' : String(value);
  return (
    <View
      pointerEvents="none"
      style={[styles.badge, flat.backgroundColor ? { backgroundColor: flat.backgroundColor } : null]}
    >
      <Text style={[styles.badgeText, flat.fontSize ? { fontSize: flat.fontSize } : null]}>
        {label}
      </Text>
    </View>
  );
}

export default function FloatingTabBar({
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

  /**
   * Which stop to light up.
   *
   * A detail route (`messages/[id]`, `admin/fees/category/[id]`) is its own tab
   * in the navigator but has no stop on the island, so focusing it would leave
   * the bar with nothing highlighted and the user with no idea where they are.
   * A stop is treated as the owner when its own path is a leading segment-run of
   * the focused route — `messages/index` owns `messages/[id]`, `admin/fees` owns
   * `admin/fees/category/[id]`. A folded screen matches no stop, which is the
   * honest answer: it is not on the island.
   */
  const focusedRoute = state.routes[state.index];
  const focusedSegments = (focusedRoute?.name ?? '').split('/');
  const ownerOfFocused = stops.find((route) => {
    if (route.key === focusedRoute?.key) return true;
    const segments = route.name.split('/').filter((part, i, all) => !(part === 'index' && i === all.length - 1));
    return (
      segments.length > 0 &&
      segments.length < focusedSegments.length &&
      segments.every((part, i) => focusedSegments[i] === part)
    );
  });

  return (
    <View
      accessibilityRole="tablist"
      testID="floating-tab-bar"
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
      {stops.map((route) => {
        const descriptor = descriptors[route.key];
        const options = descriptor.options;
        const focused = route.key === focusedRoute?.key;
        // The island shows a capsule on the stop that owns the current route, so
        // a thread still reads as "Messages".
        const active = route.key === ownerOfFocused?.key;
        const title = typeof options.title === 'string' ? options.title : route.name;
        const badge = options.tabBarBadge;

        const onPress = () => {
          const event = emitter.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigateToTab(route.key);
          }
        };

        // Native reads `accessibilityState`; react-native-web ignores it and only
        // maps `aria-selected`. The selected state therefore goes out in the
        // dialect of the platform in front of us.
        const selectionProps =
          Platform.OS === 'web'
            ? ({ 'aria-selected': active } as Record<string, boolean>)
            : { accessibilityState: { selected: active } };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
            accessibilityRole="tab"
            accessibilityLabel={title}
            testID={`floating-tab-${route.name.replace(/[^a-zA-Z0-9]+/g, '-')}`}
            hitSlop={8}
            {...selectionProps}
            style={({ pressed }) => [
              styles.stop,
              active ? styles.stopActive : styles.stopIdle,
              pressed && styles.pressed,
            ]}
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
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    padding: 5,
    gap: 2,
    ...shadows.md,
  },
  stop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    height: '100%',
  },
  stopActive: {
    backgroundColor: colors.blue,
    paddingHorizontal: 14,
    gap: 8,
    flexShrink: 1,
  },
  stopIdle: {
    flex: 1,
    paddingHorizontal: 6,
  },
  pressed: {
    opacity: 0.85,
  },
  iconWrap: {
    width: 22,
    alignItems: 'center',
  },
  label: {
    fontFamily,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: colors.onNavy,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.redText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily,
    color: colors.onNavy,
    fontSize: 10,
    fontWeight: '700',
  },
});
