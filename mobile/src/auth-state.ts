/**
 * TRACK — shared auth snapshot.
 *
 * RootLayout decides between the (auth) and (app) stacks, but it mounts once
 * and reads SecureStore only on mount. Without a shared store a successful
 * login (or a logout, or a 401 that drops the token) never reaches it, and the
 * user stays stuck on whichever stack was rendered at boot.
 *
 * This is a deliberately tiny module-level pub/sub: one boolean, a Set of
 * listeners, no dependencies. client.ts publishes; layouts subscribe.
 */

import { useSyncExternalStore } from 'react';

type Listener = (authed: boolean) => void;

/** null until the first SecureStore check resolves. */
let snapshot: boolean | null = null;
const listeners = new Set<Listener>();

export function getAuthSnapshot(): boolean | null {
  return snapshot;
}

/** Publish a new auth state. Idempotent — repeated equal values are still broadcast. */
export function setAuthSnapshot(authed: boolean): void {
  snapshot = authed;
  listeners.forEach((listener) => listener(authed));
}

/** Subscribe to auth changes. Returns an unsubscribe function for useEffect cleanup. */
export function subscribeAuth(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Reactive view of the snapshot for components — used by the cold-start
 * index route to pick between the login form and the role dashboard.
 * Returns null until the first token check resolves (treat as signed out).
 */
export function useAuthSnapshot(): boolean | null {
  return useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    () => null
  );
}
