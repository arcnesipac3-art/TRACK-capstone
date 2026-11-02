import { useEffect, useState } from 'react'
import api from '../../services/api'
import { disablePush, enablePush, pushSupported } from '../../services/push'

/**
 * One user's own delivery preferences.
 *
 * Off-by-default push is the server's rule (`notify_push` starts false); this
 * panel only exposes what the server says is possible. Turning push on here
 * without an endpoint registered with the push service would be a switch that
 * lies, so the subscription is requested first and the preference is only saved
 * if the browser actually grants one.
 */
export default function PushPreferences({ supported = pushSupported() }) {
  const [settings, setSettings] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [publicKey, setPublicKey] = useState(null)

  useEffect(() => {
    let active = true
    api
      .get('/messaging/settings/')
      .then((row) => active && setSettings(row))
      .catch((err) => active && setError(err))
    api
      .get('/messaging/options/')
      .then((row) => active && setPublicKey(row.vapid_public_key))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  async function save(patch) {
    setBusy(true)
    setError(null)
    try {
      const next = await api.put('/messaging/settings/', patch)
      setSettings(next)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function togglePush(next) {
    if (!next) {
      await save({ notify_push: false })
      await disablePush().catch(() => {})
      return
    }
    if (!supported) {
      setError(new Error('This browser cannot receive notifications.'))
      return
    }
    if (!publicKey) return
    setBusy(true)
    setError(null)
    try {
      await enablePush(publicKey)
      await save({ notify_push: true })
    } catch (err) {
      // A refused permission or a 503 from an unconfigured server leaves the
      // switch where it was — the label and the behaviour still agree.
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  if (!settings) {
    return (
      <p className="muted">
        {error ? `Could not load notification settings: ${error.message}` : 'Loading settings…'}
      </p>
    )
  }

  return (
    <div className="stack stack-xs">
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings.notify_in_app}
          disabled={busy}
          onChange={(event) => save({ notify_in_app: event.target.checked })}
        />
        <span>In-app notifications</span>
      </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings.notify_push}
          disabled={busy || !settings.push_available}
          onChange={(event) => togglePush(event.target.checked)}
        />
        <span>Browser notifications</span>
      </label>

      {!settings.push_available && (
        <p className="subtle">
          This server has no push keys configured, so nothing can be delivered outside TRACK.
        </p>
      )}
      {settings.push_available && !supported && (
        <p className="subtle">
          Your browser can only accept notifications on a secure origin (HTTPS or localhost).
        </p>
      )}
      {error && <p className="alert alert-error">{error.message}</p>}
    </div>
  )
}
