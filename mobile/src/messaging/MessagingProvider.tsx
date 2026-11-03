/**
 * TRACK — mounts the session's one messaging socket.
 *
 * Lives inside the signed-in shell, so the socket starts once a token is
 * confirmed and stops when the user leaves the app stack (sign-out, or a 401
 * that dropped the token). It renders nothing: the screens it feeds subscribe
 * through `useMessagingEvents` / `useMessagingUnread` in ./bus.
 */
import { useEffect, type ReactNode } from 'react';

import { connectMessaging, disconnectMessaging } from './bus';

export default function MessagingProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    connectMessaging();
    return () => {
      disconnectMessaging();
    };
  }, []);

  return <>{children}</>;
}
