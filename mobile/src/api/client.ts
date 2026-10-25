/**
 * TRACK — mobile API client.
 *
 * Mirrors `frontend/src/services/api.js` so both apps behave identically:
 * same error shape, same DRF pagination handling, same message extraction.
 *
 * The one deliberate difference is authentication. This app has no cookie
 * jar, so instead of a Django session + CSRF header it sends
 * `Authorization: Token <key>`, which Django's TokenAuthentication accepts
 * with no CSRF token required (a token is not ambient authority the way a
 * cookie is).
 *
 * The token lives in expo-secure-store, never in AsyncStorage or console.
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { setAuthSnapshot } from '../auth-state';

const TOKEN_KEY = 'track.auth.token';

/**
 * Base URL of the Django API.
 *
 * - Android emulator:  `http://10.0.2.2:8000/api`
 * - iOS simulator:     `http://localhost:8000/api`
 * - Physical device:   `http://<your-machine-LAN-IP>:8000/api`
 * - Production build:  `https://<deployed-backend-host>/api`
 *
 * Resolved from EXPO_PUBLIC_API_URL (Expo inlines it at bundle time, files in
 * `mobile/` — .env.development for dev, eas.json `env` / EAS environment
 * variables for release builds). Never hardcode an IP here — the LAN address
 * changes between networks.
 *
 * Release builds (EAS builds, `expo export`, non-debug `expo run:android`)
 * must never fall back to localhost: a phone cannot reach its own localhost,
 * so a shipped build would fail silently in the field. Development keeps the
 * localhost fallback so a fresh clone runs with nothing to configure.
 */
const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;

const RAW_API_BASE =
  process.env.EXPO_PUBLIC_API_URL ?? (IS_DEV ? 'http://localhost:8000/api' : undefined);

const IS_LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i;

if (!RAW_API_BASE || (!IS_DEV && IS_LOCALHOST.test(RAW_API_BASE))) {
  throw new Error(
    !RAW_API_BASE
      ? 'EXPO_PUBLIC_API_URL is not set for this build. Development reads mobile/.env.development; release builds must set it via eas.json "env" (or EAS environment variables) or mobile/.env.production.local before `expo export`.'
      : `EXPO_PUBLIC_API_URL is "${RAW_API_BASE}" in a release build. A phone cannot reach localhost — point it at the deployed backend (https://<host>/api).`
  );
}

export const API_BASE = RAW_API_BASE.replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/* ------------------------------------------------------------------ */
/* Token storage                                                       */
/* ------------------------------------------------------------------ */

type TokenStorage = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

/**
 * SecureStore rejects keys outside [A-Za-z0-9._-], so the storage key is
 * written in that set. It is a constant, not derived from user input.
 *
 * Backend selection:
 * - Native (Android/iOS/tvOS): expo-secure-store — per the Expo SDK 58 docs
 *   it has no web implementation, so a real device always takes the
 *   encrypted keystore/keychain branch below.
 * - Web: browsers have no SecureStore, so the token falls back to
 *   localStorage. Expo web exists for development/testing parity with the
 *   React web app (which keeps its session client-side too); phones never
 *   run this branch.
 */
const browserStorage: TokenStorage = {
  getItemAsync: async (key) => globalThis.localStorage?.getItem(key) ?? null,
  setItemAsync: async (key, value) => {
    globalThis.localStorage?.setItem(key, value);
  },
  deleteItemAsync: async (key) => {
    globalThis.localStorage?.removeItem(key);
  },
};

const tokenStorage: TokenStorage =
  Platform.OS === 'web' ? browserStorage : SecureStore;

export async function getToken(): Promise<string | null> {
  try {
    return await tokenStorage.getItemAsync(TOKEN_KEY);
  } catch {
    // A device with no secure enclave still has to be able to boot the app;
    // treat an unreadable vault as "signed out" rather than crashing.
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await tokenStorage.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  try {
    await tokenStorage.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Best effort: the server-side key is deleted by the logout call, so a
    // failed local delete cannot leave a usable credential behind.
  }
}

/* ------------------------------------------------------------------ */
/* Request plumbing                                                    */
/* ------------------------------------------------------------------ */

type QueryParams = Record<string, string | number | undefined | null>;

function buildUrl(path: string, params?: QueryParams): string {
  const url = /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`;
  if (!params) return url;

  const query: string[] = [];
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  });
  return query.length ? `${url}${url.includes('?') ? '&' : '?'}${query.join('&')}` : url;
}

/** Flatten DRF error payloads into one readable message. */
function messageFrom(body: unknown, fallback: string): string {
  if (!body) return fallback;
  if (typeof body === 'string') return body;

  const record = body as Record<string, unknown>;
  if (record.detail) return String(record.detail);
  if (record.non_field_errors) {
    const list = Array.isArray(record.non_field_errors)
      ? record.non_field_errors
      : [record.non_field_errors];
    return list.map(String).join(' ');
  }

  const parts: string[] = [];
  Object.entries(record).forEach(([field, value]) => {
    const text = Array.isArray(value) ? value.map(String).join(' ') : String(value);
    parts.push(`${field === 'non_field_errors' ? '' : field + ': '}${text}`);
  });
  return parts.length ? parts.join(' ') : fallback;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  params?: QueryParams;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params } = options;
  const token = await getToken();

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Token ${token}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      'Cannot reach the TRACK server. Check that Django is running and that EXPO_PUBLIC_API_URL points at it.',
      0
    );
  }

  if (response.status === 204) return null as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  // 401 means the stored token was revoked (signed out elsewhere, or the key
  // was deleted server-side). Drop it so the next boot lands on the login
  // screen instead of retrying a dead credential forever — and tell the
  // running app immediately, so RootLayout swaps to the auth stack without
  // waiting for a restart.
  if (response.status === 401) {
    await clearToken();
    setAuthSnapshot(false);
  }

  if (!response.ok) {
    throw new ApiError(
      messageFrom(payload, `Request failed (${response.status}).`),
      response.status,
      payload
    );
  }
  return payload as T;
}

/** Follows DRF pagination and returns a plain array (capped at 10 pages). */
async function list<T>(path: string, options: RequestOptions = {}): Promise<T[]> {
  let page = await request<{ results?: T[]; next?: string | null }>(path, {
    ...options,
    params: { ...options.params, page_size: 100 },
  });

  if (Array.isArray(page)) return page as unknown as T[];

  const results = [...(page?.results ?? [])];
  let pages = 1;
  let next = page?.next ?? null;
  while (next && pages < 10) {
    const subsequent = await request<{ results?: T[]; next?: string | null }>(next);
    if (!subsequent || !Array.isArray(subsequent.results)) break;
    results.push(...subsequent.results);
    next = subsequent.next ?? null;
    pages += 1;
  }
  return results;
}

export const api = {
  me: () => request<SessionUser>('/auth/me/'),
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, options),
  list: <T>(path: string, options?: RequestOptions) => list<T>(path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

/* ------------------------------------------------------------------ */
/* Auth endpoints                                                      */
/* ------------------------------------------------------------------ */

export type Role = 'admin' | 'teacher' | 'student' | 'parent';

export type SessionUser = {
  id: number;
  username: string;
  email?: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  full_name: string;
  role: Role;
  is_active: boolean;
};

export const auth = {
  /**
   * Exchanges credentials for a token. Accepts a username or an email
   * address, matching the web login.
   */
  login: async (identifier: string, password: string) => {
    const data = await request<{ token: string; user: SessionUser }>('/auth/token/', {
      method: 'POST',
      body: { username: identifier, password },
    });
    await setToken(data.token);
    // Flip RootLayout to the (app) stack now that a credential exists.
    setAuthSnapshot(true);
    return data.user;
  },

  /**
   * Revokes the token server-side first, then clears local storage. The order
   * matters: clearing only locally would leave a usable key alive.
   */
  logout: async () => {
    try {
      await request('/auth/token/logout/', { method: 'POST', body: {} });
    } catch {
      // Even if the server is unreachable the local credential must go.
    }
    await clearToken();
    setAuthSnapshot(false);
  },

  me: () => request<SessionUser>('/auth/me/'),
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, options),
};

export default api;
