/**
 * TRACK — browser push (Web Push / VAPID) for the messaging screens.
 *
 * Push is the transport for the one thing the socket cannot do: reach a user
 * who is not looking at TRACK. The server owns the rules (is push configured,
 * does this user want it, are they already reading that thread) — this module
 * only registers an endpoint and hands it over.
 *
 * The payload is a sender name and a truncated preview — the same two lines the
 * in-app bell already stores — delivered encrypted to this browser's key, plus
 * the URL of the thread. The worker never keeps message text: the app refetches
 * it over the authenticated API.
 */

import api from './api'

const SERVICE_WORKER = '/push-sw.js'

/** Whether this browser can show a push button at all. */
export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    window.isSecureContext
  )
}

function urlBase64ToKey(publicKey) {
  const padding = '='.repeat((4 - (publicKey.length % 4)) % 4)
  const base64 = publicKey.replace(/-/g, '+').replace(/_/g, '/') + padding
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)))
}

async function registration() {
  return navigator.serviceWorker.register(SERVICE_WORKER)
}

/** The endpoint this browser already holds, or null. */
export async function currentEndpoint() {
  if (!pushSupported()) return null
  const serviceWorker = await registration()
  const subscription = await serviceWorker.pushManager.getSubscription()
  return subscription ? subscription.toJSON() : null
}

/**
 * Ask the browser for permission, subscribe, and register the endpoint with
 * TRACK. Returns the subscription JSON, or null when the user said no.
 */
export async function enablePush(publicKey) {
  if (!pushSupported() || !publicKey) return null
  const serviceWorker = await registration()
  const subscription = await serviceWorker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToKey(publicKey),
  })
  const json = subscription.toJSON()
  await api.post('/messaging/push/subscriptions/', {
    endpoint: json.endpoint,
    keys: json.keys,
  })
  return json
}

/** Drop the endpoint here and forget it server-side. */
export async function disablePush() {
  if (!pushSupported()) return
  const serviceWorker = await registration()
  const subscription = await serviceWorker.pushManager.getSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  await api.delete('/messaging/push/subscriptions/', { params: { endpoint } })
}
