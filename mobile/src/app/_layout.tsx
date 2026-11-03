/**
 * Root layout — decides whether the user sees the auth stack or the app shell.
 *
 * Runs before any screen, so the token check must be synchronous-ish. We use
 * SecureStore.getItemAsync which is async but fast enough for the splash.
 *
 * Lato is loaded here rather than in a screen: the type scale in `theme.ts`
 * names it, so a screen that painted before the font settled would show the
 * system face and then reflow underneath the user.
 */
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

import { colors } from '../theme';
import { useAppFonts } from '../fonts';
import { getToken } from '../api/client';
import { setAuthSnapshot, subscribeAuth } from '../auth-state';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [fontsLoaded] = useAppFonts();

  useEffect(() => {
    // Start listening before the first token read resolves so a login/logout
    // that lands mid-boot cannot be missed.
    const unsubscribe = subscribeAuth(setAuthed);
    getToken().then((t) => {
      setAuthSnapshot(!!t);
      setAuthed(!!t);
      setReady(true);
    });
    return unsubscribe;
  }, []);

  if (!ready || !fontsLoaded) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={colors.navy} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {authed ? <Stack.Screen name="(app)" /> : <Stack.Screen name="(auth)" />}
    </Stack>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
});