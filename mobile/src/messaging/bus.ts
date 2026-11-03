/**
 * TRACK — one messaging socket for the whole signed-in session.
 *
 * A phone makes a per-screen socket the wrong shape: the conversation list and
 * the open thread are two routes, foregrounding the app is a common event, and
 * every extra socket is another battery drain and another presence row on the
 * server. So the socket is a module-level bus that `MessagingProvider` starts
 * once, and screens subscribe to it the way they subscribe to any other store.
 *
 * The bus holds no truth. It forwards server events and republishes the unread
 * total the server sent with them; each screen still reads its own rows over
 * REST, so a missed event costs a refresh, never a message.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { createMessagingSocket } from './realtime';
import type { MessagingSocket, SocketEvent, SocketStatus } from './realtime';

type Listener = (event: SocketEvent) => void;
type StatusListener = () => void;

let socket: MessagingSocket | null = null;
let refCount = 0;
let status: SocketStatus = 'connecting';
let unreadTotal = 0;
let foregroundSubscription: { remove: () => void } | null = null;

const eventListeners = new Set<Listener>();
const statusListeners = new Set<StatusListener>();

function publishStatus() {
  statusListeners.forEach((listener) => listener());
}

export function getUnreadTotal(): number {
  return unreadTotal;
}

/** Screens call this after a REST fetch, so the badge agrees with the list. */
export function setUnreadTotal(total: number): void {
  if (total === unreadTotal) return;
  unreadTotal = Math.max(0, total);
  publishStatus();
}

function handleEvent(event: SocketEvent) {
  if (typeof event.unread === 'number') {
    unreadTotal = Math.max(0, event.unread);
  }
  // Copy first: a listener may unsubscribe itself while being notified.
  [...eventListeners].forEach((listener) => listener(event));
  publishStatus();
}

/** Bring the socket back after a background, and ask it for what arrived. */
function reconnectIfDark() {
  if (!socket) return;
  if (!socket.isLive()) socket.start();
}

export function connectMessaging(): void {
  refCount += 1;
  if (socket) return;

  socket = createMessagingSocket({
    onEvent: handleEvent,
    onStatus: (next) => {
      status = next;
      publishStatus();
    },
  });
  status = 'connecting';
  socket.start();

  // A phone that leaves the background has almost always lost its socket: the
  // OS drops radios, and the server's 90-second presence row expires. Nothing
  // else wakes this process, so this is the reconnect. Registered once per
  // session and removed with the session — a sign-out and sign-in must not
  // leave a second listener behind.
  if (foregroundSubscription == null) {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') reconnectIfDark();
    });
    foregroundSubscription = { remove: () => subscription.remove() };
  }
}

export function disconnectMessaging(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0 || !socket) return;
  const closing = socket;
  socket = null;
  status = 'closed';
  foregroundSubscription?.remove();
  foregroundSubscription = null;
  closing.stop();
  publishStatus();
}

export function getMessagingSocket(): MessagingSocket | null {
  return socket;
}

/**
 * Send a frame through the session socket, or report that there is no live one
 * so the caller can use HTTPS for the same write.
 */
export function withSocket<T>(run: (live: MessagingSocket) => T): T | false {
  const live = socket;
  if (!live || !live.isLive()) return false;
  return run(live);
}

/**
 * Forward every server event to one screen. The handler is kept in a ref so a
 * render that changed the closure does not re-subscribe and miss a frame.
 */
export function useMessagingEvents(handler: (event: SocketEvent) => void): void {
  const handlerRef = useRef<(event: SocketEvent) => void>(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const listener: Listener = (event) => handlerRef.current(event);
    eventListeners.add(listener);
    return () => {
      eventListeners.delete(listener);
    };
  }, []);
}

export function useMessagingStatus(): SocketStatus {
  return useSyncExternalStore(
    (onStoreChange) => {
      statusListeners.add(onStoreChange);
      return () => {
        statusListeners.delete(onStoreChange);
      };
    },
    () => status,
    () => status
  );
}

export function useMessagingUnread(): number {
  return useSyncExternalStore(
    (onStoreChange) => {
      statusListeners.add(onStoreChange);
      return () => {
        statusListeners.delete(onStoreChange);
      };
    },
    getUnreadTotal,
    getUnreadTotal
  );
}
