/*
 * TRACK — web push service worker for messaging.
 *
 * The payload the push service delivers is what the server decided this
 * recipient should see on a lock screen (see backend/core/notifications.py):
 * a sender name, a truncated preview, a tag that collapses repeats of the same
 * thread, and the in-app URL that thread lives at. Nothing here talks to the
 * API or holds a token — the worker only draws the notification and hands the
 * click to the app, which is authenticated on its own.
 *
 * Registered by frontend/src/services/push.js. Served from the app origin so
 * it can show notifications for TRACK and nothing else.
 */

self.addEventListener('install', () => {
  // A deployed fix should apply without waiting for every tab to close.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'TRACK'
  const tag = data.tag || 'track'

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'New message.',
      tag,
      icon: '/logo-navy.png',
      badge: '/favicon.png',
      data: { url: data.url || '/messages/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/messages/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Reuse a TRACK tab already showing this thread rather than stacking
      // another copy of the same conversation.
      const existing = windows.find((window) => window.url === new URL(target, self.location).href)
      if (existing) return existing.focus()
      return self.clients.openWindow(target)
    })
  )
})
