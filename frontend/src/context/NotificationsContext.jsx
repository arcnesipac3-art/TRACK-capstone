import { createContext, useContext } from 'react'

/**
 * The one `/notifications/` fetch shared by the whole authenticated shell:
 * AppLayout fetches once for the topbar bell and provides it here, so the
 * dashboard card and the notifications page read the same data instead of
 * each firing their own identical request. Mark-as-read reloads update
 * every consumer at once.
 *
 * `null` (outside the provider) means "fetch for yourself" — consumers use
 * a small child component for that fallback so hook order stays stable.
 */
export const NotificationsContext = createContext(null)

export function useNotifications() {
  return useContext(NotificationsContext)
}
