/**
 * TRACK — branded app header.
 *
 * Brings the website's identity (frontend: navy sidebar + topbar) to every
 * mobile screen: a navy panel carrying the white logo lockup, an uppercase
 * eyebrow, the screen title, an optional subtitle, and an optional right-side
 * action slot. Screens render this at the top of their ScrollView so every
 * route is instantly identifiable — previously list screens opened with no
 * title at all.
 */
import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '../../theme';

const LOGO = require('../../../assets/logo-white.png');

type AppHeaderProps = {
  title: string;
  /** Uppercase micro-label above the title (defaults to the school name). */
  eyebrow?: string;
  subtitle?: string;
  /** Rendered top-right (e.g. <SignOutButton variant="onNavy" />). */
  right?: ReactNode;
  /** Taller variant for dashboards (greeting screens). */
  hero?: boolean;
};

export default function AppHeader({
  title,
  eyebrow = 'Kiwalan National High School',
  subtitle,
  right,
  hero = false,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.md }, hero && styles.hero]}>
      {/* Decorative concentric rings — echo of the web login aside. */}
      <View pointerEvents="none" style={styles.ringLarge} />
      <View pointerEvents="none" style={styles.ringSmall} />

      <View style={styles.topRow}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" accessibilityLabel="TRACK" />
        {right ? <View>{right}</View> : null}
      </View>

      <Text style={styles.eyebrow} numberOfLines={1}>
        {eyebrow.toUpperCase()}
      </Text>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={3}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.navy800,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    overflow: 'hidden',
  },
  hero: {
    paddingBottom: spacing.xl + spacing.sm,
  },
  ringLarge: {
    position: 'absolute',
    top: -140,
    right: -110,
    width: 300,
    height: 300,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
  },
  ringSmall: {
    position: 'absolute',
    top: -60,
    right: -30,
    width: 170,
    height: 170,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  logo: {
    height: 30,
    width: 120,
  },
  eyebrow: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.onNavyMuted,
  },
  title: {
    fontSize: 21,
    fontWeight: '700',
    color: colors.onNavy,
    marginTop: 3,
  },
  subtitle: {
    fontSize: 13,
    color: colors.onNavyMuted,
    marginTop: 4,
    lineHeight: 18,
  },
});
