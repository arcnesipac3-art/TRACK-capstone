/**
 * TRACK — the shell every screen mounts in.
 *
 * Two jobs, both invisible when they work:
 *
 * 1. The page wash, so no screen has to remember its own background, and the
 *    header and the body agree about where the gutter is.
 * 2. The transition between modules. A tab switch used to be an instant swap of
 *    two full-height navy panels — the thing that makes a phone app feel like a
 *    website. Content now rises 8dp into place over 220ms when a scene gains
 *    focus, which is enough to read as movement and too little to wait for.
 *
 * `animationKey` restarts it when what is on screen changes identity — a filter,
 * a selected day — so a list that reloads under a new filter arrives as new
 * content rather than flickering in place.
 */
import type { ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useEntrance } from '../../anim';
import { colors } from '../../theme';

type ScreenProps = {
  children: ReactNode;
  /** Usually an <AppHeader />; it scrolls with the body unless it is sticky. */
  header?: ReactNode;
  /** Content below the header — normally a ScrollView or FlatList. */
  style?: StyleProp<ViewStyle>;
  animationKey?: unknown;
};

export default function Screen({ children, header, style, animationKey }: ScreenProps) {
  const entrance = useEntrance(animationKey, { rise: 8 });

  // A tab switch is a focus, not a render, so it cannot be a `key` — but it is
  // the same arrival and has to look the same.
  useFocusEffect(entrance.restart);

  return (
    <View style={[styles.screen, style]}>
      {header}
      <Animated.View style={[styles.body, { opacity: entrance.opacity, transform: [{ translateY: entrance.translateY }] }]}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
});
