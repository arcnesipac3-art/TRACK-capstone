import { useCallback, useRef, useState } from 'react'
import ConfirmDialog from '../components/ConfirmDialog'
import ConfirmContext from './ConfirmContext'

/**
 * Owns the single confirmation dialog the whole shell shares, so a screen only
 * has to call `confirm(...)` — no per-page dialog markup, no pending-action
 * state. See ConfirmContext.js for the hook.
 */
export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null)
  const resolveRef = useRef(null)

  const confirm = useCallback((options) => {
    const opts =
      typeof options === 'string' ? { title: 'Are you sure?', message: options } : options
    return new Promise((resolve) => {
      // A second request while one is open answers the first with "cancel":
      // no caller should be left waiting on a dialog that has been replaced.
      resolveRef.current?.(false)
      resolveRef.current = resolve
      setRequest({ confirmLabel: 'Confirm', cancelLabel: 'Cancel', tone: 'danger', ...opts })
    })
  }, [])

  function settle(accepted) {
    const resolve = resolveRef.current
    resolveRef.current = null
    setRequest(null)
    resolve?.(accepted)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={request !== null}
        {...request}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  )
}
