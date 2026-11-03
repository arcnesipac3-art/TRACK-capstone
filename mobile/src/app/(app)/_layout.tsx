/**
 * App shell — the role-based tab navigator.
 *
 * This runs after RootLayout confirmed a token exists. It fetches /auth/me/
 * once to learn the role, then renders the appropriate tab navigator.
 *
 * The bar is `FloatingTabBar` — a detached pill rather than the default strip.
 * The island holds at most six stops, which is what a 360dp phone can show
 * without truncating a label, so each role folds one screen off the bar. The
 * folds are the screens another screen in the same role reaches directly —
 * student and parent Attendance and admin Requirements from their dashboard
 * tiles, teacher Timetable from the full-timetable row on the Classes hub — so
 * nothing becomes unreachable, it simply stops competing for a slot.
 *
 * Failure handling: a failed /auth/me/ no longer strands the user on an
 * infinite spinner. A network error keeps the local token (the server is just
 * unreachable) and offers retry/sign-out; a 401 clears the token inside the
 * API client, which flips the shared auth snapshot and returns to login.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../../theme';
import { api, auth, ApiError, type SessionUser } from '../../api/client';
import FloatingTabBar, { islandClearance } from '../../components/FloatingTabBar';
import { ErrorState, LoadingState } from '../../components/StateViews';
import { setSessionUser } from '../../session-user';
import { useMessagingUnread } from '../../messaging/bus';
import MessagingProvider from '../../messaging/MessagingProvider';

/** Line-style icons (22px) — mirrors the website sidebar's icon + label nav. */
const tabIcon =
  (name: keyof typeof Ionicons.glyphMap) =>
  // eslint-disable-next-line react/display-name
  (props: any) => (
    <Ionicons name={name} size={props.size ?? 22} color={props.color ?? colors.blue} />
  );

/**
 * The Messages stop, shared by every role because every role can be messaged.
 *
 * The web app puts `/messages` in its own phone navigation for all four roles
 * (frontend: `MOBILE_PRIMARY`), so the tab bar is the equivalent here rather
 * than an entry buried in a dashboard. The badge is the server's unread total —
 * published by the session socket and corrected by each list fetch — and is
 * empty, not "0", when there is nothing to read.
 */
function messagesTab(unread: number) {
  const icon = (props: any) => (
    <Ionicons
      name={props.focused ? 'chatbubbles' : 'chatbubbles-outline'}
      size={props.size ?? 22}
      color={props.color ?? colors.blue}
    />
  );
  return (
    <Tabs.Screen
      name="messages/index"
      options={{
        title: 'Messages',
        tabBarIcon: icon,
        tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : String(unread)) : undefined,
        tabBarBadgeStyle: { backgroundColor: colors.redText, fontSize: 9.5 },
      }}
    />
  );
}

/**
 * A screen that stays in the navigator but is not a stop on the island.
 *
 * Same mechanism as the detail routes below — `FloatingTabBar` skips any route
 * whose descriptor defines `tabBarButton` — used for the one screen per role
 * that does not earn a slot in a six-stop bar. Each of those is still reachable
 * from its role's dashboard, which already deep-links it.
 */
const offIsland = { tabBarButton: () => null };

/**
 * Screens that live in this group but are not stops on the bar.
 *
 * A tab navigator can only show screens it was given, and expo-router sends a
 * path it cannot match to the nearest tab — which is why `/messages/7` used to
 * land on the dashboard carrying `?id=7`, and the same for the fee editors.
 * Declaring each one keeps the route in the navigator, and `tabBarButton: () =>
 * null` keeps it off the bar. `href: null` looks like the right option and is
 * the wrong one: it drops the screen from the route table, so nothing can
 * navigate to it either.
 */
const threadTabs = [
  <Tabs.Screen key="messages/new" name="messages/new" options={offIsland} />,
  <Tabs.Screen key="messages/[id]" name="messages/[id]" options={offIsland} />,
];

const feeEditorTabs = [
  <Tabs.Screen key="fees/category" name="admin/fees/category/[id]" options={offIsland} />,
  <Tabs.Screen key="fees/assessment" name="admin/fees/assessment/[id]" options={offIsland} />,
];

/**
 * The teacher class workspace and its one detail screen.
 *
 * `/teacher/classes` is the web app's My Classes list (`MOBILE_PRIMARY`), and
 * the `[id]` route is the per-subject workspace grouped under it. The detail
 * route must still be declared — expo-router sends a path it cannot match to
 * the nearest tab — and stays off the island, because it is only ever opened
 * from the hub or a dashboard row.
 */
const classTabs = [
  <Tabs.Screen key="classes/detail" name="teacher/classes/[id]" options={offIsland} />,
];

/**
 * The account screen, declared in every role's navigator.
 *
 * One screen for all four roles — the web app puts the same `/profile` in each
 * role's sidebar — and it is opened from the header, so it never earns a slot
 * on the island.
 */
const profileTab = <Tabs.Screen key="profile" name="profile" options={offIsland} />;

/**
 * Admin account management, opened from the Directory.
 *
 * The island is already at six stops for an administrator, and the write side
 * of the directory belongs next to the read side rather than on the bar, so
 * both screens are reached from `/admin/directory`.
 */
const accountTabs = [
  <Tabs.Screen key="accounts" name="admin/accounts" options={offIsland} />,
  <Tabs.Screen key="accounts/detail" name="admin/accounts/[id]" options={offIsland} />,
];

function AppLayout() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const unread = useMessagingUnread();
  const insets = useSafeAreaInsets();

  // The island is absolutely positioned, so it floats over the scene instead of
  // reserving its own row the way the default bar did. Every tab screen gets its
  // clearance measured against the same inset the bar positions itself from.
  const screenOptions = useMemo(
    () => ({
      ...baseScreenOptions,
      sceneStyle: { paddingBottom: islandClearance(insets.bottom) },
    }),
    [insets.bottom]
  );

  const load = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
      // Publish the session for the screens under this shell — a thread needs
      // to know which bubbles are the reader's own.
      setSessionUser(me);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Token revoked: the client already cleared it and published the auth
        // change, so RootLayout is switching to the login stack right now.
        setSessionUser(null);
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
      <MessagingProvider>
        <Tabs tabBar={FloatingTabBar} screenOptions={screenOptions}>
          <Tabs.Screen name="student/dashboard" options={{ title: 'Dashboard', tabBarIcon: tabIcon('grid-outline') }} />
          <Tabs.Screen name="student/requirements" options={{ title: 'Requirements', tabBarIcon: tabIcon('document-text-outline') }} />
          <Tabs.Screen name="student/submissions" options={{ title: 'Submissions', tabBarIcon: tabIcon('cloud-upload-outline') }} />
          <Tabs.Screen name="student/attendance" options={{ title: 'Attendance', tabBarIcon: tabIcon('calendar-outline'), ...offIsland }} />
          <Tabs.Screen name="student/fees" options={{ title: 'Fees', tabBarIcon: tabIcon('cash-outline') }} />
          <Tabs.Screen name="student/notifications" options={{ title: 'Notices', tabBarIcon: tabIcon('megaphone-outline') }} />
          {messagesTab(unread)}
          {threadTabs}
          {profileTab}
        </Tabs>
      </MessagingProvider>
    );
  }

  // Parent tabs
  if (user.role === 'parent') {
    return (
      <MessagingProvider>
        <Tabs tabBar={FloatingTabBar} screenOptions={screenOptions}>
          <Tabs.Screen name="parent/dashboard" options={{ title: 'Dashboard', tabBarIcon: tabIcon('grid-outline') }} />
          <Tabs.Screen name="parent/children" options={{ title: 'My Children', tabBarIcon: tabIcon('people-outline') }} />
          <Tabs.Screen
            name="parent/requirements"
            options={{ title: 'Requirements', tabBarIcon: tabIcon('document-text-outline') }}
          />
          <Tabs.Screen name="parent/attendance" options={{ title: 'Attendance', tabBarIcon: tabIcon('calendar-outline'), ...offIsland }} />
          <Tabs.Screen name="parent/fees" options={{ title: 'Fees', tabBarIcon: tabIcon('cash-outline') }} />
          <Tabs.Screen name="parent/notifications" options={{ title: 'Notices', tabBarIcon: tabIcon('megaphone-outline') }} />
          {messagesTab(unread)}
          {threadTabs}
          {profileTab}
        </Tabs>
      </MessagingProvider>
    );
  }

  // Teacher tabs
  if (user.role === 'teacher') {
    return (
      <MessagingProvider>
        <Tabs tabBar={FloatingTabBar} screenOptions={screenOptions}>
          <Tabs.Screen name="teacher/dashboard" options={{ title: 'Dashboard', tabBarIcon: tabIcon('grid-outline') }} />
          <Tabs.Screen name="teacher/classes" options={{ title: 'Classes', tabBarIcon: tabIcon('school-outline') }} />
          <Tabs.Screen name="teacher/attendance" options={{ title: 'Attendance', tabBarIcon: tabIcon('calendar-outline') }} />
          <Tabs.Screen name="teacher/review" options={{ title: 'Review', tabBarIcon: tabIcon('clipboard-outline') }} />
          <Tabs.Screen
            name="teacher/timetable"
            options={{ title: 'Timetable', tabBarIcon: tabIcon('time-outline'), ...offIsland }}
          />
          <Tabs.Screen name="teacher/notices" options={{ title: 'Notices', tabBarIcon: tabIcon('megaphone-outline') }} />
          {messagesTab(unread)}
          {threadTabs}
          {profileTab}
          {classTabs}
        </Tabs>
      </MessagingProvider>
    );
  }

  // Admin tabs
  if (user.role === 'admin') {
    return (
      <MessagingProvider>
        <Tabs tabBar={FloatingTabBar} screenOptions={screenOptions}>
          <Tabs.Screen name="admin/dashboard" options={{ title: 'Dashboard', tabBarIcon: tabIcon('grid-outline') }} />
          <Tabs.Screen name="admin/directory" options={{ title: 'Directory', tabBarIcon: tabIcon('people-outline') }} />
          <Tabs.Screen name="admin/attendance" options={{ title: 'Classes', tabBarIcon: tabIcon('school-outline') }} />
          <Tabs.Screen name="admin/fees" options={{ title: 'Fees', tabBarIcon: tabIcon('cash-outline') }} />
          <Tabs.Screen
            name="admin/requirements"
            options={{ title: 'Requirements', tabBarIcon: tabIcon('document-text-outline'), ...offIsland }}
          />
          <Tabs.Screen name="admin/notices" options={{ title: 'Notices', tabBarIcon: tabIcon('megaphone-outline') }} />
          {messagesTab(unread)}
          {threadTabs}
          {profileTab}
          {feeEditorTabs}
          {accountTabs}
        </Tabs>
      </MessagingProvider>
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

/**
 * Navigator defaults shared by every role.
 *
 * The bar's own look lives in `FloatingTabBar`; the only thing left here is the
 * scene clearance the island needs, which `AppLayout` adds per bottom inset.
 */
const baseScreenOptions = {
  headerShown: false,
};
