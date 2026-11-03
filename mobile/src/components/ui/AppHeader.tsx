/**
 * TRACK — branded app header.
 *
 * Khan Academy opens a course with a flat dark-navy panel: a breadcrumb line,
 * the name of the thing you are looking at in bold white, and nothing else
 * competing with it. The navy carries the identity so the body of the screen
 * can stay quiet and white.
 *
 * Screens render this as the first child of their ScrollView, and every route
 * gets one — previously list screens opened with no title at all.
 */
import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '../../theme';

const LOGO = require('../../../assets/logo-white.png');

type AppHeaderProps = {
  title: string;
  /** Uppercase micro-label above the title (defaults to the school name). */
  eyebrow?: string;
  subtitle?: string;
  /** Rendered top-right (e.g. <HeaderActions />). */
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
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.lg }, hero && styles.hero]}>
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
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  hero: {
    paddingBottom: spacing.xxl,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  logo: {
    height: 28,
    width: 112,
  },
  eyebrow: {
    ...typography.label,
    color: colors.onNavyMuted,
    letterSpacing: 1,
  },
  title: {
    ...typography.pageTitle,
    marginTop: spacing.xs,
  },
  subtitle: {
    ...typography.muted,
    color: colors.onNavyMuted,
    marginTop: spacing.sm,
  },
});
