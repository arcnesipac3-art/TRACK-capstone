/**
 * TRACK — the signed-in user, published once for the whole app stack.
 *
 * AppLayout fetches `/auth/me/` to pick the role's tabs and kept the result to
 * itself, so any screen that needed the current user (a thread deciding which
 * bubbles are yours, a composer that needs the sender name for its optimistic
 * row) had to fetch the same session a second time. This is the same tiny
 * module-level store auth-state.ts uses, one read per sign-in.
 */

import { useSyncExternalStore } from 'react';

import type { SessionUser } from './api/client';

type Listener = (user: SessionUser | null) => void;

let current: SessionUser | null = null;
const listeners = new Set<Listener>();

export function getSessionUser(): SessionUser | null {
  return current;
}

export function setSessionUser(user: SessionUser | null): void {
  current = user;
  listeners.forEach((listener) => listener(user));
}

export function useSessionUser(): SessionUser | null {
  return useSyncExternalStore(
    (onStoreChange) => {
      const listener: Listener = () => onStoreChange();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSessionUser,
    getSessionUser
  );
}

/**
 * True when the signed-in administrator holds a permission key.
 *
 * The same rule the web app uses (frontend: AuthProvider `can`): it only
 * decides which actions the interface offers. Django checks the key again on
 * every request, so hiding a button is courtesy, not security — and an account
 * that is not an administrator has no keys at all.
 */
export function canKey(user: SessionUser | null, key: string): boolean {
  return !!user && user.role === 'admin' && (user.permissions ?? []).includes(key);
}
