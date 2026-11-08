/**
 * TRACK — initials avatar.
 *
 * Every person in this app is a line of text, and a wall of lines of text is
 * unreadable at a glance. An initials disc gives a list something the eye can land
 * on and lets a row be identified by shape and colour as well as by name.
 *
 * The colour is derived from the name, not picked at random, so the same student is
 * the same disc in the Directory, on a fee line and in a class roster. That
 * consistency is the whole point — a rotating palette would give a different answer
 * on every render and read as noise.
 *
 * There is no profile-picture field anywhere in the API, so this component has no
 * image path: adding one would be a prop nothing can ever set.
 */
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, radius, typography } from '../../theme';

const SIZE = {
  sm: { box: 32, text: 12 },
  md: { box: 44, text: 15 },
  lg: { box: 56, text: 19 },
  xl: { box: 72, text: 24 },
} as const;

/** Six brand-derived hues, far enough apart that two neighbours never look alike. */
const RAMP = [colors.navy, colors.blue, colors.teal, colors.violet, colors.green, colors.gold];

/** One or two letters: first name initial, then last name initial when there is one. */
export function initialsOf(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-zÀ-ÿ'’-]/g, ''))
    .filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const first = parts[0]?.[0] ?? '';
  const last = parts[parts.length - 1]?.[0] ?? '';
  return (first + last).toUpperCase();
}

/** Stable for a given name, so a person keeps their colour across the app. */
export function hueFor(name: string) {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum = (sum + name.charCodeAt(i)) % 997;
  return RAMP[sum % RAMP.length];
}

type AvatarProps = {
  /** The person's display name — the source of both the letters and the colour. */
  name: string;
  size?: keyof typeof SIZE;
  /** Override the derived hue, e.g. to match a status the row already carries. */
  hue?: string;
  style?: StyleProp<ViewStyle>;
};

export default function Avatar({ name, size = 'md', hue, style }: AvatarProps) {
  const metrics = SIZE[size];
  const background = hue ?? hueFor(name);

  return (
    <View
      style={[
        styles.disc,
        { width: metrics.box, height: metrics.box, borderRadius: radius.pill, backgroundColor: background },
        style,
      ]}
      accessibilityRole="image"
      accessibilityLabel={`${name}, avatar`}
    >
      <Text style={[styles.text, { fontSize: metrics.text, lineHeight: metrics.text + 3 }]}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { alignItems: 'center', justifyContent: 'center' },
  text: { ...typography.micro, fontWeight: '700', color: colors.onNavy, letterSpacing: 0.3 },
});
