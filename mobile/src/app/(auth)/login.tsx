/**
 * Login screen — exchanges username/email + password for a token.
 *
 * Mirrors the web login (frontend/src/pages/LoginPage.jsx): a solid navy
 * brand panel with the white logo lockup, tagline and decorative rings above
 * a light form area with "Welcome back", labelled fields, a SHOW/HIDE password
 * toggle and one full-width navy submit button.
 *
 * Auth behavior is unchanged: accepts either a username or an email address,
 * and surfaces a single "Invalid username or password" message so the
 * attacker learns nothing about which half was wrong.
 */
import { useState } from 'react';
import { router } from 'expo-router';
import {
  Image,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, shadows, spacing } from '../../theme';
import { api, auth } from '../../api/client';
import Button from '../../components/ui/Button';

const LOGO_WHITE = require('../../../assets/logo-white.png');

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const insets = useSafeAreaInsets();

  const handleSubmit = async () => {
    Keyboard.dismiss();
    setError('');

    if (!identifier.trim() || !password) {
      setError('Enter your username or email and password.');
      return;
    }

    setLoading(true);
    try {
      await auth.login(identifier.trim(), password);
      // Explicit cross-platform forwarding. The token now exists and the auth
      // snapshot has flipped, but the current URL (/login) stays in the
      // router tree (routes are file-based on web too), so RootLayout's
      // stack swap alone never navigates. Resolve the role server-side with
      // the same /auth/me/ call AppLayout makes and land on that role's
      // dashboard.
      const me = await api.me();
      router.replace(`/${me.role}/dashboard`);
    } catch (err) {
      if (err instanceof Error && 'status' in err && (err as any).status === 400) {
        setError('Invalid username or password.');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Brand panel — the web login's navy aside, adapted to a phone. */}
      <View style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}>
        <View pointerEvents="none" style={styles.ringLarge} />
        <View pointerEvents="none" style={styles.ringSmall} />

        <Image source={LOGO_WHITE} style={styles.logo} resizeMode="contain" accessibilityLabel="TRACK" />
        <Text style={styles.tagline}>
          One place for requirements, attendance, and communication.
        </Text>
        <Text style={styles.heroFooter}>Kiwalan National High School · Iligan City</Text>
      </View>

      <ScrollView
        style={styles.formArea}
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.welcome}>Welcome back</Text>
        <Text style={styles.lede}>Sign in to continue to TRACK.</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={styles.label}>Username or Email</Text>
          <TextInput
            style={styles.input}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoComplete="username"
            placeholder="student1 or student@school.edu.ph"
            placeholderTextColor={colors.textSubtle}
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="current-password"
              placeholder="••••••••"
              placeholderTextColor={colors.textSubtle}
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
            />
            <TouchableOpacity
              style={styles.showHide}
              onPress={() => setShowPassword((visible) => !visible)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Text style={styles.showHideLabel}>{showPassword ? 'HIDE' : 'SHOW'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Button onPress={handleSubmit} loading={loading} block style={styles.submit}>
          Sign in
        </Button>

        <View style={styles.note}>
          <Text style={styles.noteText}>
            Use your school credentials. Parents and students sign in here.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  /* Navy brand panel */
  hero: {
    backgroundColor: colors.navy800,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
  },
  ringLarge: {
    position: 'absolute',
    top: -120,
    right: -90,
    width: 300,
    height: 300,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
  },
  ringSmall: {
    top: -40,
    right: -20,
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  logo: {
    height: 38,
    width: 150,
    marginBottom: spacing.lg,
  },
  tagline: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.onNavy,
    lineHeight: 23,
    maxWidth: 300,
  },
  heroFooter: {
    fontSize: 12,
    color: colors.onNavyMuted,
    marginTop: spacing.lg,
  },
  /* Form */
  formArea: {
    flex: 1,
  },
  formContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  welcome: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.navy900,
  },
  lede: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: spacing.xl,
  },
  errorBox: {
    backgroundColor: colors.red100,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    fontSize: 14,
    color: colors.red700,
    textAlign: 'center',
  },
  field: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 42,
    fontSize: 16,
    color: colors.text,
  },
  passwordRow: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 64,
  },
  showHide: {
    position: 'absolute',
    right: spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  showHideLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: colors.navy700,
  },
  submit: {
    marginTop: spacing.sm,
  },
  note: {
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    ...shadows.sm,
  },
  noteText: {
    fontSize: 12.5,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
