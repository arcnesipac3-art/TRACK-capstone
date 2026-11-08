/**
 * TRACK — branded screen header, in the two shapes a phone needs.
 *
 * `hero` is the navy panel, and it is now the exception rather than the rule:
 * only a role's dashboard opens on it, because a greeting is the one place where
 * a slab of brand colour earns its height. Everything below a dashboard is a
 * `bar` — a light row carrying the name of the screen, a back chevron when there
 * is somewhere to go back to, and actions at the thumb's right hand.
 *
 * That split is the answer to "every screen is a big navy block". Twenty-nine
 * screens used to share one treatment; four keep it, and the rest read as
 * content on a page instead of a banner over one.
 *
 * The logo lives in the hero only. A 28dp mark above every screen's title is
 * branding repeated until it stops being noticed; once, at the top of the
 * dashboard, is enough.
 */
import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing, touch, typography } from '../../theme';
import { hapticImpact } from '../../haptics';

const LOGO = require('../../../assets/logo-white.png');

type AppHeaderProps = {
  title: string;
  /** Micro-label above the title. On a hero it defaults to the school name. */
  eyebrow?: string;
  subtitle?: string;
  /** Rendered top-right (e.g. <HeaderActions />). */
  right?: ReactNode;
  /** Taller navy variant for a role's dashboard. Off everywhere else. */
  hero?: boolean;
  /**
   * Draw a back chevron. On a `bar` only: a dashboard is a root and has nothing
   * to go back to, which is why the hero ignores it.
   */
  back?: boolean | string;
  /** Where `back` goes when it is not the previous scene. */
  backTo?: string;
};

export default function AppHeader({
  title,
  eyebrow,
  subtitle,
  right,
  hero = false,
  back = false,
  backTo,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();

  if (hero) {
    return (
      <View style={[styles.heroWrap, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.heroTop}>
          <Image
            source={LOGO}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="TRACK"
          />
          {right ? <View>{right}</View> : null}
        </View>
        <Text style={styles.heroEyebrow} numberOfLines={1}>
          {(eyebrow ?? 'Kiwalan National High School').toUpperCase()}
        </Text>
        <Text style={styles.heroTitle} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.heroSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    );
  }

  const onBack = () => {
    hapticImpact('light');
    if (typeof back === 'string' || backTo) {
      router.push((backTo ?? back) as never);
    } else {
      router.back();
    }
  };

  return (
    <View style={[styles.barWrap, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.barRow}>
        {back ? (
          <Pressable
            onPress={onBack}
            hitSlop={8}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconPressed]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.navy} />
          </Pressable>
        ) : (
          <View style={styles.eyebrowBlock}>
            {eyebrow ? (
              <Text style={styles.barEyebrow} numberOfLines={1}>
                {eyebrow.toUpperCase()}
              </Text>
            ) : null}
          </View>
        )}

        <Text style={styles.barTitle} numberOfLines={1}>
          {title}
        </Text>

        <View style={styles.barRight}>{right}</View>
      </View>
      {subtitle ? (
        <Text style={styles.barSubtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /* Hero ------------------------------------------------------------------ */
  heroWrap: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    // A second, deeper band along the bottom edge: the navy stops being a flat
    // rectangle without the page having to become a gradient.
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    borderBottomWidth: 3,
    borderBottomColor: colors.navySoft,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  logo: { height: 26, width: 104 },
  heroEyebrow: { ...typography.label, color: colors.onNavyMuted, letterSpacing: 1 },
  heroTitle: { ...typography.display, color: colors.onNavy, marginTop: spacing.xs },
  heroSubtitle: { ...typography.muted, color: colors.onNavyMuted, marginTop: spacing.sm },

  /* Bar ------------------------------------------------------------------- */
  barWrap: {
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touch.target,
  },
  eyebrowBlock: { minWidth: 44 },
  barEyebrow: { ...typography.label, color: colors.textSubtle },
  barTitle: { ...typography.title, flex: 1, minWidth: 0 },
  barRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  barSubtitle: { ...typography.caption, color: colors.textMuted, paddingLeft: 4 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  iconPressed: { backgroundColor: colors.quietFill },
});
