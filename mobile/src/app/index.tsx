/**
 * Cold-start route ("/").
 *
 * Expo Router boots every app launch on "/", and this project had no index
 * route, so a phone or browser landing on the root URL rendered the router's
 * "Unmatched Route" screen instead of the app. This route fixes that:
 *
 * - Signed-out visitors get the login form (declarative <Redirect>).
 * - Signed-in visitors are forwarded to their own role's dashboard, resolved
 *   through /auth/me/ — the same call AppLayout makes. A second unthrottled
 *   GET on cold start is cheap, and reusing the server's role answer keeps
 *   the client from hardcoding or guessing where each role lands.
 *
 * Failure paths: a 401 already clears the token inside the API client (the
 * auth snapshot flips and RootLayout swaps stacks); an unreachable server
 * lands on the login screen, whose submit path surfaces the network error
 * with a retry. Either way the user sees an actionable screen, not a spinner.
 */
import { useEffect } from 'react';
import { Redirect, router } from 'expo-router';

import { api } from '../api/client';
import { useAuthSnapshot } from '../auth-state';
import { LoadingState } from '../components/StateViews';

export default function IndexRoute() {
  const authed = useAuthSnapshot();

  useEffect(() => {
    if (!authed) return;
    let alive = true;
    api
      .me()
      .then((me) => {
        if (alive) router.replace(`/${me.role}/dashboard`);
      })
      .catch(() => {
        if (alive) router.replace('/login');
      });
    return () => {
      alive = false;
    };
  }, [authed]);

  if (!authed) return <Redirect href="/login" />;
  return <LoadingState label="Opening TRACK…" />;
}
