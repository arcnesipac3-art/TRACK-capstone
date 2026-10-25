/**
 * App shell — the role-based tab navigator.
 *
 * This runs after RootLayout confirmed a token exists. It fetches /auth/me/
 * once to learn the role, then renders the appropriate tab navigator.
 *
 * Failure handling: a failed /auth/me/ no longer strands the user on an
 * infinite spinner. A network error keeps the local token (the server is just
 * unreachable) and offers retry/sign-out; a 401 clears the token inside the
 * API client, which flips the shared auth snapshot and returns to login.
 */
import { useCallback, useEffect, useState } from 'react';
import { router, Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../../theme';
import { api, auth, ApiError, type SessionUser } from '../../api/client';
import { ErrorState, LoadingState } from '../../components/StateViews';

/** Line-style icons (22px) — mirrors the website sidebar's icon + label nav. */
const tabIcon =
  (name: keyof typeof Ionicons.glyphMap) =>
  // eslint-disable-next-line react/display-name, @typescript-eslint/no-explicit-any
  (props: any) => (
    <Ionicons name={name} size={props.size ?? 22} color={props.color ?? colors.navy700} />
  );

function AppLayout() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Token revoked: the client already cleared it and published the auth
        // change, so RootLayout is switching to the login stack right now.
        return;
      }
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not confirm your session. Check your connection and try again.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const retry = () => {
    setLoading(true);
    setError(null);
    load();
  };

  if (loading) return <LoadingState label="Starting TRACK…" />;

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={retry}
      />
    );
  }

  if (!user) {
    // 401 path: auth state has been cleared, RootLayout will unmount this.
    return <LoadingState label="Returning to sign in…" />;
  }

  // Student tabs
  if (user.role === 'student') {
    return (
      <Tabs screenOptions={tabScreenOptions}>
        <Tabs.Screen name="student/dashboard" options={{ title: 'Dashboard', tabBarIcon: tabIcon('grid-outline') }} />
        <Tabs.Screen name="student/requirements" options={{ title: 'Requirements', tabBarIcon: tabIcon('document-text-outline') }} />
        <Tabs.Screen name="student/submissions" options={{ title: 'Submissions', tabBarIcon: tabIcon('cloud-upload-outline') }} />
        <Tabs.Screen name="student/attendance" options={{ title: 'Attendance', tabBarIcon: tabIcon('calendar-outline') }} />
        <Tabs.Screen name="student/fees" options={{ title: 'Fees', tabBarIcon: tabIcon('cash-outline') }} />
        <Tabs.Screen name="student/notifications" options={{ title: 'Notices', tabBarIcon: tabIcon('megaphone-outline') }} />
      </Tabs>
    );
  }

  // Parent tabs
  if (user.role === 'parent') {
    return (
      <Tabs screenOptions={tabScreenOptions}>
        <Tabs.Screen name="parent/dashboard" options={{ title: 'Dashboard', tabBarIcon: tabIcon('grid-outline') }} />
        <Tabs.Screen name="parent/children" options={{ title: 'My Children', tabBarIcon: tabIcon('people-outline') }} />
        <Tabs.Screen
          name="parent/requirements"
          options={{ title: 'Requirements', tabBarIcon: tabIcon('document-text-outline') }}
        />
        <Tabs.Screen name="parent/attendance" options={{ title: 'Attendance', tabBarIcon: tabIcon('calendar-outline') }} />
        <Tabs.Screen name="parent/fees" options={{ title: 'Fees', tabBarIcon: tabIcon('cash-outline') }} />
        <Tabs.Screen name="parent/notifications" options={{ title: 'Notices', tabBarIcon: tabIcon('megaphone-outline') }} />
      </Tabs>
    );
  }

  // Teacher tabs
  if (user.role === 'teacher') {
    return (
      <Tabs screenOptions={tabScreenOptions}>
        <Tabs.Screen name="teacher/dashboard" options={{ title: 'Dashboard', tabBarIcon: tabIcon('grid-outline') }} />
        <Tabs.Screen name="teacher/attendance" options={{ title: 'Attendance', tabBarIcon: tabIcon('calendar-outline') }} />
        <Tabs.Screen name="teacher/review" options={{ title: 'Review', tabBarIcon: tabIcon('clipboard-outline') }} />
        <Tabs.Screen name="teacher/timetable" options={{ title: 'Timetable', tabBarIcon: tabIcon('time-outline') }} />
        <Tabs.Screen name="teacher/notices" options={{ title: 'Notices', tabBarIcon: tabIcon('megaphone-outline') }} />
      </Tabs>
    );
  }

  // Admin tabs
  if (user.role === 'admin') {
    return (
      <Tabs screenOptions={tabScreenOptions}>
        <Tabs.Screen name="admin/dashboard" options={{ title: 'Dashboard', tabBarIcon: tabIcon('grid-outline') }} />
        <Tabs.Screen name="admin/directory" options={{ title: 'Directory', tabBarIcon: tabIcon('people-outline') }} />
        <Tabs.Screen name="admin/attendance" options={{ title: 'Classes', tabBarIcon: tabIcon('school-outline') }} />
        <Tabs.Screen name="admin/fees" options={{ title: 'Fees', tabBarIcon: tabIcon('cash-outline') }} />
        <Tabs.Screen
          name="admin/requirements"
          options={{ title: 'Requirements', tabBarIcon: tabIcon('document-text-outline') }}
        />
        <Tabs.Screen name="admin/notices" options={{ title: 'Notices', tabBarIcon: tabIcon('megaphone-outline') }} />
      </Tabs>
    );
  }

  // Unknown role (backend only issues the four above, but stay defensive).
  return (
    <ErrorState
      message={`Unsupported account role: ${user.role}`}
      onRetry={() => {
        auth.logout().finally(() => router.replace('/login'));
      }}
      retryLabel="Sign out"
    />
  );
}
AppLayout.displayName = 'AppLayout';

export default AppLayout;

const tabScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.navy700,
  tabBarInactiveTintColor: colors.textMuted,
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    height: 56,
    paddingBottom: 8,
  },
  tabBarLabelStyle: {
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 0.2,
  },
};
