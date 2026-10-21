/**
 * Root layout — decides whether the user sees the auth stack or the app shell.
 *
 * Runs before any screen, so the token check must be synchronous-ish. We use
 * SecureStore.getItemAsync which is async but fast enough for the splash.
 */
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

import { colors } from '../theme';
import { getToken } from '../api/client';
import { setAuthSnapshot, subscribeAuth } from '../auth-state';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

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

  if (!ready) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={colors.navy700} />
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